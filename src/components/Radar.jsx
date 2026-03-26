import React, { useEffect, useRef } from "react";

export default function Radar({ size = 300, blips = [], zones = [] }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const DPR = window.devicePixelRatio || 1;
    canvas.width = Math.round(size * DPR);
    canvas.height = Math.round(size * DPR);
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    let angle = 0;

    function draw() {
      ctx.clearRect(0, 0, size, size);
      const cx = size / 2;
      const cy = size / 2;
      const radius = Math.min(cx, cy) - 12;

      // ── Background circle ──────────────────────────────────────────
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius + 12, 0, Math.PI * 2);
      ctx.fillStyle = "#011219";
      ctx.fill();
      ctx.restore();

      // outer glow ring
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius + 6, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(6,182,212,0.18)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();

      // ── Set up clipping path = radar circle ──────────────────────
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.clip();           // everything below is clipped inside the circle

      // concentric grid circles
      for (let i = 1; i <= 4; i++) {
        const r = (radius / 4) * i;
        ctx.beginPath();
        ctx.strokeStyle = `rgba(6,182,212,${0.08 + 0.02 * (4 - i)})`;
        ctx.lineWidth = 1;
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      }

      // cross lines
      ctx.beginPath();
      ctx.strokeStyle = "rgba(6,182,212,0.14)";
      ctx.lineWidth = 1;
      ctx.moveTo(cx - radius, cy);
      ctx.lineTo(cx + radius, cy);
      ctx.moveTo(cx, cy - radius);
      ctx.lineTo(cx, cy + radius);
      ctx.stroke();

      // sweeping wedge
      const sweepAngle = 0.7;
      const grad = ctx.createRadialGradient(cx, cy, radius * 0.1, cx, cy, radius);
      grad.addColorStop(0, "rgba(6,182,212,0.35)");
      grad.addColorStop(0.6, "rgba(6,182,212,0.12)");
      grad.addColorStop(1, "rgba(6,182,212,0)");
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius, -sweepAngle / 2, sweepAngle / 2);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.globalCompositeOperation = "lighter";
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      ctx.restore();

      // ── Zone rings (clipped inside circle) ────────────────────────
      const MAX_ZONE_M = Math.max(...zones.map((z) => z.radius || 1), 1);
      const TYPE_ICON = {
        village: "\ud83c\udfd8",
        farmland: "\ud83c\udf3e",
        highway: "\ud83d\udee3",
        railway: "\ud83d\ude82",
        forest_border: "\ud83c\udf33",
      };
      zones.forEach((z) => {
        const zx = cx + (z.x || 0) * radius;
        const zy = cy - (z.y || 0) * radius;
        const ringR = Math.max(8, ((z.radius || 0) / MAX_ZONE_M) * radius * 0.42);
        const color = z.color || "#06b6d4";

        // filled zone ring
        ctx.save();
        ctx.beginPath();
        ctx.arc(zx, zy, ringR, 0, Math.PI * 2);
        ctx.strokeStyle = color + "bb";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = color + "22";
        ctx.fill();
        ctx.restore();

        // zone center dot
        ctx.save();
        ctx.shadowBlur = 12;
        ctx.shadowColor = color;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(zx, zy, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // label with type emoji — clamped inside radar
        const labelY = zy - ringR - 16;
        const clampedLY = Math.max(cy - radius + 16, Math.min(cy + radius - 8, labelY));
        ctx.save();
        ctx.fillStyle = color;
        ctx.font = "bold 11px Arial";
        ctx.textAlign = "center";
        ctx.fillText((TYPE_ICON[z.type] || "") + " " + (z.name || z.type || "zone"), zx, clampedLY);
        ctx.restore();
      });

      // center marker — fixed monitoring point (yellow dot)
      ctx.save();
      ctx.shadowBlur = 14;
      ctx.shadowColor = "#facc15";
      ctx.fillStyle = "#facc15";
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(250,204,21,0.4)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - 16, cy); ctx.lineTo(cx + 16, cy);
      ctx.moveTo(cx, cy - 16); ctx.lineTo(cx, cy + 16);
      ctx.stroke();
      ctx.restore();

      ctx.restore(); // ── end clipping region ──────────────────────

      // ── Tick marks drawn OUTSIDE clipping (around the border) ────
      ctx.save();
      for (let t = 0; t < 60; t++) {
        const theta = (t / 60) * Math.PI * 2;
        const outerR = radius + 9;
        const innerR = t % 5 === 0 ? radius + 1 : radius + 5;
        ctx.beginPath();
        ctx.strokeStyle = t % 5 === 0 ? "rgba(6,182,212,0.7)" : "rgba(6,182,212,0.22)";
        ctx.lineWidth = t % 5 === 0 ? 2 : 1;
        ctx.moveTo(cx + Math.cos(theta) * innerR, cy + Math.sin(theta) * innerR);
        ctx.lineTo(cx + Math.cos(theta) * outerR, cy + Math.sin(theta) * outerR);
        ctx.stroke();
      }
      ctx.restore();

      // ── Blips (animal) — drawn outside clipping so always on top ──
      blips.forEach((b, idx) => {
        const bx = cx + (b.x || 0) * radius;
        const by = cy - (b.y || 0) * radius;
        const pulse = 1 + 0.28 * Math.sin(Date.now() / 260 + idx);
        const color = b.color || "#10b981";

        ctx.save();

        // outer pulse ring
        ctx.beginPath();
        ctx.strokeStyle = color + "33";
        ctx.lineWidth = 2;
        ctx.arc(bx, by, 36 * pulse, 0, Math.PI * 2);
        ctx.stroke();

        // inner pulse ring
        ctx.beginPath();
        ctx.strokeStyle = color + "77";
        ctx.lineWidth = 2.5;
        ctx.arc(bx, by, 22 * pulse, 0, Math.PI * 2);
        ctx.stroke();

        if (b.icon) {
          // tiger emoji with green glow
          ctx.shadowBlur = 24 * pulse;
          ctx.shadowColor = color;
          ctx.font = "26px Arial";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(b.icon, bx, by);
        } else {
          ctx.shadowBlur = 22 * pulse;
          ctx.shadowColor = color;
          ctx.fillStyle = color;
          ctx.globalAlpha = 0.98;
          ctx.beginPath();
          ctx.arc(bx, by, 7, 0, Math.PI * 2);
          ctx.fill();
        }

        if (typeof b.distanceMeters === "number") {
          const textY = Math.max(cy - radius + 14, Math.min(cy + radius - 8, by - 14));
          ctx.fillStyle = "#d1fae5";
          ctx.font = "bold 11px Arial";
          ctx.textAlign = "center";
          ctx.fillText(`${b.distanceMeters} m`, bx, textY);
        }

        ctx.restore();
      });

      angle += 0.018;
      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);

    return () => cancelAnimationFrame(rafRef.current);
  }, [size, blips, zones]);

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
      <canvas ref={canvasRef} style={{ borderRadius: 10 }} />
    </div>
  );
}
