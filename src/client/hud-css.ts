/**
 * Theme-aware stylesheet for the HUD, injected once by apply() and removed on
 * plugin unload. It consumes the global `--dsw-*` semantic tokens published by
 * ui-theme, so it follows the active color theme with no literal colors.
 */
export const hudCss = `
.dsh-hud {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font: var(--dsw-font-xxs-12);
  color: var(--dsw-alias-label-secondary);
  user-select: none;
}
.dsh-hud-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 12px;
  min-height: 20px;
}
.dsh-hud-badge-wrap {
  position: relative;
  flex: none;
}
.dsh-hud-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0 7px;
  height: 16px;
  border-radius: 8px;
  font: var(--dsw-font-xxxs-strong-11);
  letter-spacing: 0.06em;
  color: var(--dsw-alias-label-secondary);
  background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l1);
  cursor: pointer;
  flex: none;
}
.dsh-hud-badge:hover {
  border-color: var(--dsw-alias-border-l2);
}
.dsh-hud-badge-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  flex: none;
}
.dsh-hud-badge--idle {
  color: var(--dsw-alias-label-secondary);
}
.dsh-hud-badge--loading {
  color: var(--dsw-static-amber-500);
}
.dsh-hud-badge--loading .dsh-hud-badge-dot {
  animation: dsh-hud-pulse 1s ease-in-out infinite;
}
.dsh-hud-badge--ready {
  color: var(--dsw-alias-state-success-primary);
}
.dsh-hud-seg {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  min-width: 0;
}
.dsh-hud-metric {
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
}
.dsh-hud-divider {
  color: var(--dsw-alias-border-l2);
}
.dsh-hud-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--dsw-alias-label-secondary);
  flex: none;
}
.dsh-hud-dot--idle {
  background: var(--dsw-alias-label-secondary);
  opacity: 0.6;
}
.dsh-hud-dot--running {
  background: var(--dsw-static-amber-500);
  animation: dsh-hud-pulse 1s ease-in-out infinite;
}
.dsh-hud-dot--streaming {
  background: var(--dsw-alias-brand-primary);
}
@keyframes dsh-hud-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}
.dsh-hud-bar {
  position: relative;
  width: 64px;
  height: 6px;
  border-radius: 3px;
  background: var(--dsw-alias-border-l1);
  overflow: hidden;
  flex: none;
}
.dsh-hud-bar-fill {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  border-radius: 3px;
  background: var(--dsw-alias-brand-primary);
  transition: width 0.25s ease;
}
.dsh-hud-bar-fill--warn {
  background: var(--dsw-static-amber-500);
}
.dsh-hud-bar-fill--danger {
  background: var(--dsw-alias-state-error-primary);
}
.dsh-hud-label {
  color: var(--dsw-alias-label-secondary);
}
.dsh-hud-value {
  color: var(--dsw-alias-label-primary);
  font-variant-numeric: tabular-nums;
}
.dsh-hud-path {
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dsh-hud-prev {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dsh-hud-config {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 1000;
  min-width: 200px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  background: var(--dsw-alias-bg-overlay);
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 8px;
  box-shadow: var(--dsw-shadow-lv3);
}
.dsh-hud-config-title {
  font: var(--dsw-font-xs-strong-13);
  color: var(--dsw-alias-label-primary);
  padding: 2px 4px 6px;
}
.dsh-hud-config-sub {
  font: var(--dsw-font-xxs-strong-12);
  color: var(--dsw-alias-label-secondary);
  padding: 6px 4px 2px;
}
.dsh-hud-config-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 4px;
  border-radius: 4px;
  font: var(--dsw-font-xxs-12);
  color: var(--dsw-alias-label-primary);
  cursor: pointer;
}
.dsh-hud-config-item:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dsh-hud-config-item input {
  margin: 0;
  flex: none;
}
.dsh-hud-config-pricing {
  justify-content: space-between;
}
.dsh-hud-config-pricing input[type="number"] {
  width: 64px;
  padding: 1px 4px;
  background: var(--dsw-alias-bg-layer-1);
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 4px;
  color: var(--dsw-alias-label-primary);
  font: var(--dsw-font-xxs-12);
}
`
