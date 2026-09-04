(function () {
  const baseUrl = window.MeteoHistoryConfig.API_BASE_URL;

  async function request(path) {
    const response = await fetch(`${baseUrl}${path}`, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok || !body || !body.ok) throw new Error(`Históricos respondió ${response.status}`);
    return body;
  }

  window.MeteoHistoryApi = {
    async fetchHistory(period) {
      const body = await request(`/api/history?${period}`);
      if (!Array.isArray(body.data)) throw new Error("Respuesta histórica inválida");
      return body.data;
    },
    async fetchDate(date) {
      const body = await request(`/api/history?date=${encodeURIComponent(date)}`);
      if (!Array.isArray(body.data)) throw new Error("Respuesta histórica inválida");
      return body.data;
    },
    async fetchInfo() { return (await request("/api/history/info")).data; },
    async fetchTodayStats() { return (await request("/api/stats/today")).data; },
    async fetchDailyStats(date) { return (await request(`/api/stats/daily?date=${encodeURIComponent(date)}`)).data; },
    async fetchDailySummary(date) { const query = date ? `?date=${encodeURIComponent(date)}` : ""; return request(`/api/daily-summary${query}`); },
    async fetchCompare(period) { return request(`/api/compare?period=${encodeURIComponent(period)}`); },
    async fetchRecords() { return (await request("/api/records")).data; },
    exportUrl(selection) {
      const parameter = selection.kind === "date" ? `date=${encodeURIComponent(selection.value)}` : `period=${encodeURIComponent(selection.value)}`;
      return `${baseUrl}/api/export.csv?${parameter}`;
    }
  };
}());
