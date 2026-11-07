import { when } from '../../../admin/labels';
import { markAdminWarnedAction, unmarkAdminWarnedAction } from '../../actions/admin';

export function WarnedCheck({
  bookingId,
  warnedAt,
  returnTo,
  date,
  view,
}: {
  bookingId: number;
  warnedAt: Date | null;
  returnTo?: 'calls';
  date?: string;
  view?: string;
}) {
  return (
    <form action={warnedAt ? unmarkAdminWarnedAction : markAdminWarnedAction}>
      <input type="hidden" name="bookingId" value={bookingId} />
      {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
      {date && <input type="hidden" name="date" value={date} />}
      {view && <input type="hidden" name="view" value={view} />}
      <button type="submit" className="warned-check" aria-pressed={!!warnedAt}>
        <span className="warned-box" aria-hidden="true" />
        Менеджер предупредил
      </button>
      {warnedAt && <small>{when(warnedAt)}</small>}
    </form>
  );
}
