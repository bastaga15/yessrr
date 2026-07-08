const JITSI_DOMAIN = "meet.jit.si";

export interface JitsiRoom {
  roomName: string;
  roomUrl: string;
}

/**
 * Generates a Jitsi Meet room for a booking. No API key needed — meet.jit.si
 * is free and rooms are created on first visit. Security is by obscurity:
 * booking ids are UUIDs, so the room name isn't guessable, only whoever has
 * the link (client, creator) can join.
 */
export function generateJitsiRoom(bookingId: string): JitsiRoom {
  const roomName = `yessrr-booking-${bookingId}`;
  return { roomName, roomUrl: `https://${JITSI_DOMAIN}/${roomName}` };
}
