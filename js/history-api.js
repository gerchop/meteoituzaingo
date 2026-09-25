(function () {
  const baseUrl = window.MeteoHistoryConfig.API_BASE_URL;

  async function request(path, options = {}) {
    const response = await fetch(`${baseUrl}${path}`, { cache: "no-store", signal: options.signal });
    const body = await response.json();
    if (!response.ok || !body || !body.ok) throw new Error(`Históricos respondió ${response.status}`);
    return body;
  }

  window.MeteoHistoryApi = {
    async fetchHistory(period, options) {
      const body = await request(`/api/history?${period}`, options);
      if (!Array.isArray(body.data)) throw new Error("Respuesta histórica inválida");
      return body.data;
    },
    async fetchDate(date, options) {
      const body = await request(`/api/history?date=${encodeURIComponent(date)}`, options);
      if (!Array.isArray(body.data)) throw new Error("Respuesta histórica inválida");
      return body.data;
    },
    async fetchInfo() { return (await request("/api/history/info")).data; },
    async fetchTodayStats() { return (await request("/api/stats/today")).data; },
    async fetchDailyStats(date) { return (await request(`/api/stats/daily?date=${encodeURIComponent(date)}`)).data; },
    async fetchDailySummary(date, options) { const query = date ? `?date=${encodeURIComponent(date)}` : ""; return request(`/api/daily-summary${query}`, options); },
    async fetchCompare(period, options) { return request(`/api/compare?period=${encodeURIComponent(period)}`, options); },
    async fetchRecords() { return (await request("/api/records")).data; },
    async fetchStatisticsInfo() { return (await request("/api/statistics/info")).data; },
    async fetchStatistics(period, value = "") { return request(`/api/statistics?period=${encodeURIComponent(period)}&value=${encodeURIComponent(value)}`); },
    exportUrl(selection) {
      const parameter = selection.kind === "date" ? `date=${encodeURIComponent(selection.value)}` : `period=${encodeURIComponent(selection.value)}`;
      return `${baseUrl}/api/export.csv?${parameter}`;
    }
  };
}());
