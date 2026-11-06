import type { Actor, BookingView, CreatedBooking, Deps, Result } from './types';

export async function createBooking(
  deps: Deps,
  input: {
    serviceId: number;
    masterId: number | null;
    start: Date;
    name: string;
    phone: string;
    idempotencyKey: string;
    actor: 'client_site' | 'manager';
  },
): Promise<Result<CreatedBooking>> {
  throw new Error('not implemented');
}

export async function moveBooking(
  deps: Deps,
  input: { bookingId: number; newStart: Date; newMasterId?: number; actor: Actor },
): Promise<Result<BookingView>> {
  throw new Error('not implemented');
}

export async function cancelBooking(
  deps: Deps,
  input: { bookingId: number; actor: Actor; reason?: string },
): Promise<Result<BookingView>> {
  throw new Error('not implemented');
}

export async function setVisitResult(
  deps: Deps,
  input: { bookingId: number; result: 'attended' | 'no_show' },
): Promise<Result<BookingView>> {
  throw new Error('not implemented');
}

export async function getBookingByToken(deps: Deps, token: string): Promise<BookingView | null> {
  throw new Error('not implemented');
}
