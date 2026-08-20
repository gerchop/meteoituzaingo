(function () {
  const locale = "es-AR";
  const timeZone = "America/Argentina/Buenos_Aires";

  function date(value) { return value instanceof Date ? value : new Date(value); }
  function format(value, options) { return new Intl.DateTimeFormat(locale, { timeZone, ...options }).format(date(value)); }

  window.MeteoDateTime = {
    formatTime(value, seconds = false) { return format(value, { hour: "2-digit", minute: "2-digit", ...(seconds ? { second: "2-digit" } : {}), hour12: false }); },
    formatDate(value) { return format(value, { day: "2-digit", month: "2-digit", year: "numeric" }); },
    formatDateTime(value, seconds = false) { return `${this.formatDate(value)} ${this.formatTime(value, seconds)}`; },
    formatShortDateTime(value) { return format(value, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }); }
  };
}());
