"use client";

export function MotionOrb({
  label = "Encrypted value",
  primary = "euint64",
  secondary = "Recipient-only decrypt",
}: {
  label?: string;
  primary?: string;
  secondary?: string;
}) {
  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    event.currentTarget.style.setProperty("--orb-ry", `${x * 10}deg`);
    event.currentTarget.style.setProperty("--orb-rx", `${y * -10}deg`);
  }

  function handlePointerLeave(event: React.PointerEvent<HTMLDivElement>) {
    event.currentTarget.style.setProperty("--orb-ry", "0deg");
    event.currentTarget.style.setProperty("--orb-rx", "0deg");
  }

  return (
    <div
      className="motion-orb-stage"
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      aria-label="Animated encrypted value visualization"
    >
      <div className="motion-orb-wrap">
        <div className="motion-orb" />
        <div className="orb-ring" />
        <span className="orb-node n1" />
        <span className="orb-node n2" />
        <span className="orb-node n3" />
        <div className="orb-float-card one">
          <small className="block text-[11px] uppercase tracking-[0.18em] text-zinc-500">
            {label}
          </small>
          <b className="mt-1 block text-[16px] text-white">{primary}</b>
        </div>
        <div className="orb-float-card two">
          <small className="block text-[11px] uppercase tracking-[0.18em] text-zinc-500">
            Proof boundary
          </small>
          <b className="mt-1 block text-[16px] text-white">{secondary}</b>
        </div>
      </div>
    </div>
  );
}
