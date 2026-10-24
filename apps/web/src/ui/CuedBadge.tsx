import { cuedError, cuedPlayer } from "../net/cuedPlayer";

/** Who plays, when StarLord was opened from cued: their avatar and name, or why the pass did not work. */
export function CuedBadge() {
  const s = cuedPlayer();
  const err = cuedError();
  if (err) return <div className="bad" title={err}>cued could not tell who you are ({err}). Reopen StarLord from cued.</div>;
  if (!s) return null;
  const { name, initials, circle, avatarUrl } = s.identity;
  return (
    <>
      <span className="cued-badge" title="Opened from cued: online games show you under your cued name">
        {avatarUrl
          ? <img src={avatarUrl} alt="" />
          : <span className="cued-initials" style={{ background: circle.background, color: circle.text }}>{initials}</span>}
        {name} <small className="muted">via cued</small>
      </span>
      {s.expired && <small className="warn">Your cued pass expired. Reopen StarLord from cued to stay signed in.</small>}
    </>
  );
}
