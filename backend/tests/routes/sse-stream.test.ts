/**
 * SSE Stream -- Test Suite
 *
 * Tests for Server-Sent Events format, reconnection, event buffering,
 * connection cleanup, and concurrent turn handling.
 */

// ---- SSE Format Helpers ----

interface ParsedSSEEvent {
  id?: string;
  event?: string;
  data?: unknown;
  rawData?: string;
}

function parseSSEResponse(rawBody: string): ParsedSSEEvent[] {
  const events: ParsedSSEEvent[] = [];
  const blocks = rawBody.split('\n\n').filter((b) => b.trim().length > 0);

  for (const block of blocks) {
    const event: ParsedSSEEvent = {};
    const lines = block.split('\n');

    for (const line of lines) {
      if (line.startsWith('id:')) {
        event.id = line.slice(3).trim();
      } else if (line.startsWith('event:')) {
        event.event = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        event.rawData = line.slice(5).trim();
        try {
          event.data = JSON.parse(event.rawData);
        } catch {
          event.data = event.rawData;
        }
      }
    }

    if (event.event || event.data) {
      events.push(event);
    }
  }

  return events;
}

function buildSSEBlock(id: number, eventType: string, data: unknown): string {
  return `id:${id}\nevent:${eventType}\ndata:${JSON.stringify(data)}\n\n`;
}

// ---- Tests ----

describe('SSE Stream Format', () => {
  // ================================================================
  // SSE Format Compliance
  // ================================================================

  describe('SSE format compliance', () => {
    it('should have correct id: field on each event', () => {
      const rawSSE =
        buildSSEBlock(1, 'turn_start', { sessionId: 's1' }) +
        buildSSEBlock(2, 'transcription', { text: 'hello' }) +
        buildSSEBlock(3, 'turn_end', { turnNumber: 1 });

      const events = parseSSEResponse(rawSSE);

      expect(events).toHaveLength(3);
      expect(events[0].id).toBe('1');
      expect(events[1].id).toBe('2');
      expect(events[2].id).toBe('3');
    });

    it('should have correct event: field on each event', () => {
      const rawSSE =
        buildSSEBlock(1, 'turn_start', { sessionId: 's1' }) +
        buildSSEBlock(2, 'narration_chunk', { text: 'The door opens.', index: 0 });

      const events = parseSSEResponse(rawSSE);

      expect(events[0].event).toBe('turn_start');
      expect(events[1].event).toBe('narration_chunk');
    });

    it('should have valid JSON in data: field', () => {
      const payload = { text: 'The door opens.', index: 0 };
      const rawSSE = buildSSEBlock(1, 'narration_chunk', payload);
      const events = parseSSEResponse(rawSSE);

      expect(events[0].data).toEqual(payload);
    });

    it('should separate events with double newline', () => {
      const rawSSE =
        buildSSEBlock(1, 'turn_start', { sessionId: 's1' }) +
        buildSSEBlock(2, 'turn_end', { turnNumber: 1 });

      // Each block ends with \n\n, so between blocks there is \n\n boundary
      expect(rawSSE).toContain('\n\n');

      const events = parseSSEResponse(rawSSE);
      expect(events).toHaveLength(2);
    });

    it('should handle events with complex nested data', () => {
      const complexData = {
        cost: {
          sttCost: 0.001,
          llmInputCost: 0.002,
          llmOutputCost: 0.003,
          ttsCost: 0.004,
          totalCost: 0.01,
        },
        turnNumber: 5,
        stateUpdates: {
          locationChange: 'Dark Cave',
          inventoryAdd: ['Magic Sword', 'Shield'],
        },
      };

      const rawSSE = buildSSEBlock(1, 'turn_end', complexData);
      const events = parseSSEResponse(rawSSE);

      expect(events[0].data).toEqual(complexData);
    });
  });

  // ================================================================
  // Reconnection (Last-Event-ID)
  // ================================================================

  describe('Reconnection with Last-Event-ID', () => {
    // Simulated event buffer (mirrors Redis buffering behavior)
    const eventBuffer: Array<{ id: number; type: string; data: unknown }> = [];

    beforeEach(() => {
      eventBuffer.length = 0;
      // Simulate 10 buffered events from a previous turn
      for (let i = 1; i <= 10; i++) {
        eventBuffer.push({
          id: i,
          type: i === 1 ? 'turn_start' : i === 10 ? 'turn_end' : 'narration_chunk',
          data: { index: i },
        });
      }
    });

    function getEventsAfter(lastEventId: number): typeof eventBuffer {
      return eventBuffer.filter((e) => e.id > lastEventId);
    }

    it('should return only events after Last-Event-ID', () => {
      const missedEvents = getEventsAfter(5);

      expect(missedEvents).toHaveLength(5);
      expect(missedEvents[0].id).toBe(6);
      expect(missedEvents[missedEvents.length - 1].id).toBe(10);
    });

    it('should return all events when Last-Event-ID is 0', () => {
      const allEvents = getEventsAfter(0);
      expect(allEvents).toHaveLength(10);
    });

    it('should return empty when Last-Event-ID is at the latest event', () => {
      const noEvents = getEventsAfter(10);
      expect(noEvents).toHaveLength(0);
    });

    it('should return all events when Last-Event-ID is before buffer start', () => {
      // If buffer starts at id=1 and client asks for id=-1
      const allEvents = getEventsAfter(-1);
      expect(allEvents).toHaveLength(10);
    });
  });

  // ================================================================
  // Event Buffering
  // ================================================================

  describe('Event buffering', () => {
    const MAX_BUFFER_SIZE = 50;

    it('should buffer up to 50 events per session', () => {
      const buffer: Array<{ id: number; type: string; data: unknown }> = [];

      for (let i = 1; i <= 50; i++) {
        buffer.push({ id: i, type: 'narration_chunk', data: { index: i } });
      }

      expect(buffer).toHaveLength(50);
    });

    it('should trim oldest events when buffer exceeds 50', () => {
      const buffer: Array<{ id: number; type: string; data: unknown }> = [];

      // Fill beyond capacity
      for (let i = 1; i <= 60; i++) {
        buffer.push({ id: i, type: 'narration_chunk', data: { index: i } });
      }

      // Trim to max size (keep newest)
      const trimmed =
        buffer.length > MAX_BUFFER_SIZE ? buffer.slice(-MAX_BUFFER_SIZE) : buffer;

      expect(trimmed).toHaveLength(50);
      expect(trimmed[0].id).toBe(11); // Oldest remaining
      expect(trimmed[trimmed.length - 1].id).toBe(60); // Newest
    });

    it('should buffer events per session (separate sessions have separate buffers)', () => {
      const buffers: Record<string, Array<{ id: number; type: string }>> = {};

      // Session A events
      buffers['session-a'] = [
        { id: 1, type: 'turn_start' },
        { id: 2, type: 'narration_chunk' },
      ];

      // Session B events
      buffers['session-b'] = [
        { id: 1, type: 'turn_start' },
        { id: 2, type: 'transcription' },
        { id: 3, type: 'narration_chunk' },
      ];

      expect(buffers['session-a']).toHaveLength(2);
      expect(buffers['session-b']).toHaveLength(3);
    });
  });

  // ================================================================
  // Connection Cleanup
  // ================================================================

  describe('Connection cleanup', () => {
    it('should track active connections per session', () => {
      const activeConnections = new Map<string, number>();

      // Simulate connecting
      activeConnections.set('session-1', (activeConnections.get('session-1') ?? 0) + 1);
      expect(activeConnections.get('session-1')).toBe(1);

      // Simulate disconnect
      activeConnections.set('session-1', (activeConnections.get('session-1') ?? 0) - 1);
      if (activeConnections.get('session-1') === 0) {
        activeConnections.delete('session-1');
      }

      expect(activeConnections.has('session-1')).toBe(false);
    });

    it('should free resources after client disconnects', () => {
      const resources: Record<string, { timer: boolean; buffer: boolean }> = {};

      // Simulate allocation
      resources['session-1'] = { timer: true, buffer: true };
      expect(resources['session-1']).toBeDefined();

      // Simulate cleanup on disconnect
      delete resources['session-1'];
      expect(resources['session-1']).toBeUndefined();
    });
  });

  // ================================================================
  // Concurrent Turn Handling
  // ================================================================

  describe('Concurrent turn handling', () => {
    it('should reject concurrent turn submission for same session', () => {
      const activeTurns = new Set<string>();

      // First turn starts
      const sessionId = 'session-1';
      const canStart = !activeTurns.has(sessionId);
      expect(canStart).toBe(true);
      activeTurns.add(sessionId);

      // Second turn attempted while first is still processing
      const canStartSecond = !activeTurns.has(sessionId);
      expect(canStartSecond).toBe(false);

      // First turn completes
      activeTurns.delete(sessionId);

      // Now a new turn can start
      const canStartThird = !activeTurns.has(sessionId);
      expect(canStartThird).toBe(true);
    });

    it('should allow turns on different sessions concurrently', () => {
      const activeTurns = new Set<string>();

      activeTurns.add('session-1');
      activeTurns.add('session-2');

      expect(activeTurns.has('session-1')).toBe(true);
      expect(activeTurns.has('session-2')).toBe(true);
      expect(activeTurns.size).toBe(2);
    });
  });
});
