const colors = {
  danger: "var(--bs-danger)",
  info: "var(--bs-info)",
  primary: "var(--bs-primary)",
  warning: "var(--bs-warning)",
};

function hexToRgbA(hex, alpha) {
  return hex.replace(/\)$/, `-alpha${alpha * 100})`);
}
