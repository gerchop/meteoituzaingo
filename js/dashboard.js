const API_URL = "https://api.weather.com/v2/pws/observations/current?stationId=IITUZAIN9&format=json&units=m&apiKey=1f02ece8a18244d482ece8a18284d480&numericPrecision=decimal";

async function cargarClima(){

    try{

        const response = await fetch(API_URL);

        const data = await response.json();

        const obs = data.observations[0];

        document.querySelector(".temp").textContent =
            obs.metric.temp + "°";

        document.querySelector(".status").textContent =
        obs.wxPhraseLong || "Tiempo actual";

        document.getElementById("actualizacion").textContent =
        new Date(obs.obsTimeLocal).toLocaleString("es-AR");

        const cards = document.querySelectorAll(".card span");

        cards[0].textContent = obs.humidity + "%";
        cards[1].textContent = obs.metric.windSpeed + " km/h";
        cards[2].textContent = obs.metric.precipTotal + " mm";
        cards[3].textContent = obs.metric.windChill + "°";
        cards[4].textContent = obs.metric.pressure + " hPa";

    }

    catch(error){

        console.error(error);

        document.querySelector(".status").textContent =
            "Error al cargar datos";

    }

}

cargarClima();

setInterval(cargarClima,150000);
