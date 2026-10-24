import { cuedError, cuedPlayer, framedByCued } from "../net/cuedPlayer";

/**
 * The cued plaque: who plays when StarLord was opened from cued (avatar and name), or why cued's
 * player did not come through. `compact` is the small version for the game's top bar.
 */
export function CuedBadge({ compact }: { compact?: boolean }) {
  const s = cuedPlayer();
  const err = cuedError();
  if (err) {
    return <div className="cued-plaque bad" title={err}>cued could not tell who you are ({err}). Reopen StarLord from cued.</div>;
  }
  if (!s) {
    if (!framedByCued || compact) return null;
    return (
      <div className="cued-plaque warn" title="cued opens games with a player pass in the address (#cued=...); none arrived">
        Opened in cued, but cued sent no player. Reopen StarLord from cued's game card.
      </div>
    );
  }
  const { name, initials, circle, avatarUrl } = s.identity;
  const face = avatarUrl
    ? <img src={avatarUrl} alt="" />
    : <span className="cued-initials" style={{ background: circle.background, color: circle.text }}>{initials}</span>;
  if (compact) {
    return <span className="cued-badge compact" title={`Connected via cued as ${name}`}>{face}<span className="cued-name">{name}</span></span>;
  }
  return (
    <div className={`cued-plaque${s.expired ? " warn" : ""}`} title="Opened from cued: online games show you under your cued name">
      {face}
      <span className="col" style={{ gap: 0 }}>
        <small className="cued-label">Connected via cued</small>
        <b>{name}</b>
        {s.expired && <small className="warn">Your cued pass expired. Reopen StarLord from cued.</small>}
      </span>
    </div>
  );
}
