/** Styles for the picker overlay. They live inside the closed shadow root, so the page cannot override them. */
export const PICKER_CSS = `
:host { all: initial; }
* { box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }

.hl, .mark, .tip { position: fixed; top: 0; left: 0; pointer-events: none; display: none; }
.hl {
  border: 2px solid #2563eb;
  background: rgba(37, 99, 235, 0.12);
  border-radius: 3px;
  transition: transform 40ms linear, width 40ms linear, height 40ms linear;
}
.tip {
  max-width: 320px;
  padding: 3px 8px;
  border-radius: 6px;
  background: #1e293b;
  color: #f8fafc;
  font: 12px/18px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mark {
  border: 2px solid #16a34a;
  background: rgba(22, 163, 74, 0.10);
  border-radius: 3px;
}
.badge {
  position: absolute;
  top: -11px;
  left: -11px;
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  border-radius: 11px;
  background: #16a34a;
  color: #fff;
  font: 600 12px/22px system-ui, sans-serif;
  text-align: center;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
}

.bar {
  position: fixed;
  left: 50%;
  bottom: 20px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 8px 8px 16px;
  border-radius: 12px;
  background: #0f172a;
  color: #e2e8f0;
  font-size: 13px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.35);
  pointer-events: auto;
  max-width: calc(100vw - 32px);
  white-space: nowrap;
}
.brand { font-weight: 700; color: #fff; white-space: nowrap; }
.count { color: #86efac; font-weight: 600; min-width: 64px; white-space: nowrap; }
.hint { color: #94a3b8; font-size: 12px; white-space: nowrap; }
@media (max-width: 640px) { .hint { display: none; } }
button {
  all: unset;
  cursor: pointer;
  padding: 7px 14px;
  border-radius: 8px;
  font: 600 13px/1 system-ui, sans-serif;
}
button:focus-visible { outline: 2px solid #93c5fd; outline-offset: 2px; }
.primary { background: #2563eb; color: #fff; }
.primary:hover { background: #1d4ed8; }
.ghost { color: #cbd5e1; }
.ghost:hover { background: #1e293b; }

.toast {
  position: fixed;
  left: 50%;
  bottom: 80px;
  transform: translateX(-50%);
  max-width: min(520px, calc(100vw - 32px));
  padding: 10px 14px;
  border-radius: 10px;
  background: #1e293b;
  color: #f8fafc;
  font-size: 13px;
  line-height: 1.4;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.35);
  opacity: 0;
  transition: opacity 150ms;
  pointer-events: none;
}
.toast.show { opacity: 1; }

.panel {
  position: fixed;
  top: 16px;
  right: 16px;
  width: min(480px, calc(100vw - 32px));
  height: min(680px, calc(100vh - 32px));
  border: 0;
  border-radius: 14px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
  pointer-events: auto;
  color-scheme: normal;
  background: transparent;
}
`;
