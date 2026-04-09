import React, { useEffect, useRef } from "react";

export default function Radar({ size = 300, blips = [], zones = [] }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const DPR = window.devicePixelRatio || 1;
    canvas.width = Math.round(size * DPR);
    canvas.height = Math.round(size * DPR);
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    let angle = 0;

    const TYPE_ICON = {
      village: "\ud83c\udfd8",
      farmland: "\ud83c\udf3e",
      highway: "\ud83d\udee3",
      railway: "\ud83d\ude82",
      forest_border: "\ud83c\udf33",
    };

    // Pill label — always drawn after clip restore so it paints on top
    // x,y is the CENTRE of the label, all bounds checked against canvas
    function pill(text, x, y, color) {
      ctx.save();
      ctx.font = `bold ${Math.max(9, Math.round(size / 32))}px Arial`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const tw = ctx.measureText(text).width;
      const ph = Math.max(13, Math.round(size / 22));
      const pw = tw + 12;
      // Clamp so label never exits canvas
      const cx2 = Math.max(pw / 2 + 2, Math.min(size - pw / 2 - 2, x));
      const cy2 = Math.max(ph / 2 + 2, Math.min(size - ph / 2 - 2, y));
      // Dark bg
      ctx.fillStyle = "rgba(2,14,22,0.92)";
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(cx2 - pw / 2, cy2 - ph / 2, pw, ph, 5);
      else ctx.rect(cx2 - pw / 2, cy2 - ph / 2, pw, ph);
      ctx.fill();
      // Color left bar
      ctx.fillStyle = color;
      ctx.fillRect(cx2 - pw / 2, cy2 - ph / 2 + 2, 3, ph - 4);
      // Text
      ctx.fillStyle = color;
      ctx.fillText(text, cx2 + 2, cy2);
      ctx.restore();
    }

    function draw() {
      ctx.clearRect(0, 0, size, size);
      const cx = size / 2;
      const cy = size / 2;
      // Leave 14px border for ticks + outer glow
      const radius = Math.min(cx, cy) - 14;

      // ── Outer shell ─────────────────────────────────────────────
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius + 14, 0, Math.PI * 2);
      ctx.fillStyle = "#010d13";
      ctx.fill();
      ctx.restore();

      // Outer glow ring
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius + 8, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(6,182,212,0.35)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();

      // ── CLIP — everything inside the radar disc ────────────────
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.clip();

      // Distance rings with subtle labels
      const ringCount = 4;
      const fontSize = Math.max(8, Math.round(size / 38));
      for (let i = 1; i <= ringCount; i++) {
        const r = (radius / ringCount) * i;
        ctx.beginPath();
        ctx.strokeStyle = `rgba(6,182,212,${0.05 + 0.035 * (ringCount - i)})`;
        ctx.lineWidth = 1;
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Crosshair lines
      ctx.beginPath();
      ctx.strokeStyle = "rgba(6,182,212,0.1)";
      ctx.lineWidth = 1;
      ctx.moveTo(cx - radius, cy); ctx.lineTo(cx + radius, cy);
      ctx.moveTo(cx, cy - radius); ctx.lineTo(cx, cy + radius);
      ctx.stroke();

      // Sweep wedge
      const sweepA = 0.65;
      const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      grd.addColorStop(0, "rgba(6,182,212,0.45)");
      grd.addColorStop(0.55, "rgba(6,182,212,0.1)");
      grd.addColorStop(1, "rgba(6,182,212,0)");
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius, -sweepA / 2, sweepA / 2);
      ctx.closePath();
      ctx.fillStyle = grd;
      ctx.globalCompositeOperation = "lighter";
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      ctx.restore();

      // ── Zone rings — position clamped, ring size clamped ────────
      const MAX_ZM = Math.max(...zones.map((z) => z.radius || 1), 1);
      zones.forEach((z) => {
        const rawX = z.x || 0;
        const rawY = z.y || 0;
        const dist = Math.sqrt(rawX * rawX + rawY * rawY); // 0..1 relative
        // Clamp zone center to 0.82 of radius so ring + dot stays inside
        const clampFactor = dist > 0.82 ? 0.82 / dist : 1;
        const zx = cx + rawX * clampFactor * radius;
        const zy = cy - rawY * clampFactor * radius;
        // Ring visual radius: max 18% of radar radius, keeps everything inside
        const ringR = Math.max(5, Math.min(radius * 0.18, ((z.radius || 0) / MAX_ZM) * radius * 0.28));
        const color = z.color || "#06b6d4";
        const outOfRange = dist > 0.9;

        // Ring
        ctx.save();
        ctx.globalAlpha = outOfRange ? 0.4 : 0.9;
        ctx.beginPath();
        ctx.arc(zx, zy, ringR, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = outOfRange ? 1 : 1.5;
        ctx.setLineDash(outOfRange ? [4, 3] : []);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = color + "20";
        ctx.fill();
        ctx.restore();

        // Zone dot
        ctx.save();
        ctx.globalAlpha = outOfRange ? 0.4 : 1;
        ctx.shadowBlur = 8;
        ctx.shadowColor = color;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(zx, zy, outOfRange ? 2.5 : 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // ── Zone label — drawn INSIDE the clip, toward centre ───
        // Position the label between the zone dot and the centre
        const towardCX = cx + (zx - cx) * 0.5;
        const towardCY = cy + (zy - cy) * 0.5;
        const labelText = (TYPE_ICON[z.type] || "") + " " + (z.name || z.type);

        ctx.save();
        ctx.globalAlpha = outOfRange ? 0.45 : 0.95;
        ctx.font = `bold ${fontSize}px Arial`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const tw2 = ctx.measureText(labelText).width;
        const ph2 = fontSize + 5;
        const pw2 = tw2 + 10;
        // Clamp to inside clip circle using simple rect clamp
        const lx = Math.max(-radius * 0.75 + cx, Math.min(radius * 0.75 + cx, towardCX));
        const ly = Math.max(-radius * 0.75 + cy, Math.min(radius * 0.75 + cy, towardCY));
        // Background
        ctx.fillStyle = "rgba(2,14,22,0.88)";
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(lx - pw2 / 2, ly - ph2 / 2, pw2, ph2, 3);
        else ctx.rect(lx - pw2 / 2, ly - ph2 / 2, pw2, ph2);
        ctx.fill();
        ctx.fillStyle = color;
        ctx.fillText(labelText, lx, ly);
        ctx.restore();
      });

      // ── User dot at centre ───────────────────────────────────
      ctx.save();
      ctx.shadowBlur = 18;
      ctx.shadowColor = "#3b82f6";
      ctx.fillStyle = "#3b82f6";
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(59,130,246,0.4)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - 16, cy); ctx.lineTo(cx + 16, cy);
      ctx.moveTo(cx, cy - 16); ctx.lineTo(cx, cy + 16);
      ctx.stroke();
      ctx.restore();

      // ── Blips (animal) inside clip ───────────────────────────
      blips.forEach((b, idx) => {
        const bx = Math.max(cx - radius * 0.9, Math.min(cx + radius * 0.9, cx + (b.x || 0) * radius));
        const by = Math.max(cy - radius * 0.9, Math.min(cy + radius * 0.9, cy - (b.y || 0) * radius));
        const pulse = 1 + 0.22 * Math.sin(Date.now() / 280 + idx);
        const color = b.color || "#10b981";

        ctx.save();
        ctx.strokeStyle = color + "22";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(bx, by, 30 * pulse, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = color + "55";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(bx, by, 18 * pulse, 0, Math.PI * 2);
        ctx.stroke();

        if (b.icon) {
          ctx.shadowBlur = 16 * pulse;
          ctx.shadowColor = color;
          ctx.font = `${Math.max(18, Math.round(size / 15))}px Arial`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(b.icon, bx, by);
          ctx.shadowBlur = 0;
        } else {
          ctx.shadowBlur = 14 * pulse;
          ctx.shadowColor = color;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(bx, by, 6, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();

        // Distance label near blip, clamped
        if (typeof b.distanceMeters === "number") {
          const d = b.distanceMeters;
          const dStr = d < 1000 ? d + " m" : (d / 1000).toFixed(2) + " km";
          const dlx = Math.max(30, Math.min(size - 30, bx));
          const dly = Math.max(fontSize + 6, Math.min(size - fontSize - 6, by - 26));
          ctx.save();
          ctx.font = `bold ${fontSize}px Arial`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          const dtw = ctx.measureText(dStr).width + 10;
          ctx.fillStyle = "rgba(2,14,22,0.9)";
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(dlx - dtw / 2, dly - 7, dtw, 14, 4);
          else ctx.rect(dlx - dtw / 2, dly - 7, dtw, 14);
          ctx.fill();
          ctx.fillStyle = "#10b981";
          ctx.fillText(dStr, dlx, dly);
          ctx.restore();
        }
      });

      ctx.restore(); // ── end clip ───────────────────────────────

      // ── Tick marks outside clip ─────────────────────────────
      ctx.save();
      for (let t = 0; t < 60; t++) {
        const theta = (t / 60) * Math.PI * 2;
        const outerR = radius + 9;
        const innerR = t % 5 === 0 ? radius + 1 : radius + 5;
        ctx.beginPath();
        ctx.strokeStyle = t % 5 === 0 ? "rgba(6,182,212,0.65)" : "rgba(6,182,212,0.15)";
        ctx.lineWidth = t % 5 === 0 ? 1.5 : 1;
        ctx.moveTo(cx + Math.cos(theta) * innerR, cy + Math.sin(theta) * innerR);
        ctx.lineTo(cx + Math.cos(theta) * outerR, cy + Math.sin(theta) * outerR);
        ctx.stroke();
      }
      ctx.restore();

      // ── "You" + distance labels in top-left corner ──────────
      // These are outside the clip but clamped to canvas
      pill("\ud83d\udccd You", cx, cy + Math.round(radius * 0.18), "#93c5fd");

      angle += 0.016;
      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [size, blips, zones]);

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", width: "100%", overflow: "hidden" }}>
      <canvas ref={canvasRef} style={{ borderRadius: "50%", maxWidth: "100%", display: "block" }} />
    </div>
  );
}
