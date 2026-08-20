window.MeteoHistoryConfig = {
  API_BASE_URL: "https://meteoituzaingo-history.meteoituzaingo.workers.dev",
  COLORS: { blue: "#1976b9", navy: "#0c3b66", muted: "#617381", gust: "#e28a35", rain: "#3688bc" },
  formatDate(timestamp, date = false) { return new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: date ? "2-digit" : undefined, month: date ? "2-digit" : undefined, hour: "2-digit", minute: "2-digit" }).format(new Date(timestamp)); }
};
