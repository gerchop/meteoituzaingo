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
    async fetchInfo() { return (await request("/api/history/info")).data; }
  };
}());
