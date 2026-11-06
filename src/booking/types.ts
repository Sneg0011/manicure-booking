import type { Db } from '../db/client';

export type Actor = 'client_site' | 'client_bot' | 'manager' | 'system';
export type BookingStatus = 'active' | 'cancelled' | 'attended' | 'no_show';
export type BookingError = 'slot_taken' | 'outside_schedule' | 'too_soon' | 'too_far' | 'too_late'
  | 'move_limit' | 'not_active' | 'not_found' | 'invalid_name' | 'invalid_phone';
export type Result<T> = { ok: true; value: T } | { ok: false; error: BookingError; alternatives?: Slot[] };
export interface Slot { start: Date; masterId: number }
export interface Deps { db: Db; now: () => Date }

export interface BookingRules {
  slotStepMin: number;
  minLeadMin: number;
  horizonDays: number;
  changeCutoffMin: number;
  maxClientMoves: number;
}

export interface BookingView {
  id: number;
  status: BookingStatus;
  startsAt: Date;
  endsAt: Date;
  masterId: number;
  masterName: string;
  serviceId: number;
  serviceName: string;
  priceRub: number;
  clientName: string;
  clientPhone: string | null;
  moveCount: number;
  source: 'site' | 'manager';
}

export type CreatedBooking = BookingView & { manageToken: string; botCode: string };
