const API_URL = "https://api.weather.com/v2/pws/observations/current?stationId=IITUZAIN9&format=json&units=m&apiKey=1f02ece8a18244d482ece8a18284d480&numericPrecision=decimal";

function direccion(grados) {
    const dir = [
        "N","NNE","NE","ENE",
        "E","ESE","SE","SSE",
        "S","SSO","SO","OSO",
        "O","ONO","NO","NNO"
    ];

    return dir[Math.round(grados / 22.5) % 16];
}

function estadoTiempo(obs){

    if(obs.metric.precipRate > 0)
        return "🌧 Lloviendo";

    if(obs.metric.windSpeed >= 30)
        return "💨 Mucho viento";

    if(obs.metric.temp >= 32)
        return "🥵 Mucho calor";

    if(obs.metric.temp <= 5)
        return "🥶 Mucho frío";

    return "🌤 Tiempo estable";
}

async function cargarClima(){

    try{

        const response = await fetch(API_URL);

        const data = await response.json();

        const obs = data.observations[0];

        console.log(obs);

        // Cabecera

        document.querySelector(".temp").textContent =
            obs.metric.temp + "°";

        document.querySelector(".status").textContent =
            estadoTiempo(obs);

        // Tarjetas

        document.getElementById("cTemp").textContent =
            obs.metric.temp + "°";

        document.getElementById("cHumedad").textContent =
            obs.humidity + "%";

        document.getElementById("cViento").textContent =
            obs.metric.windSpeed + " km/h";

        document.getElementById("cDireccion").textContent =
            direccion(obs.winddir);

        document.getElementById("cLluvia").textContent =
            obs.metric.precipTotal + " mm";

        document.getElementById("cST").textContent =
            obs.metric.windChill + "°";

        document.getElementById("cPresion").textContent =
            obs.metric.pressure + " hPa";

        document.getElementById("cSolar").textContent =
            obs.solarRadiation == null ? "--" : obs.solarRadiation + " W/m²";

        // Última actualización

        const act = document.getElementById("actualizacion");

        if(act){

            const fecha = new Date(obs.obsTimeLocal);

            act.textContent =
                "Última actualización: " +
                fecha.toLocaleDateString("es-AR") +
                " " +
                fecha.toLocaleTimeString("es-AR");
        }

    }
    catch(error){

        console.error(error);

        document.querySelector(".status").textContent =
            "Error de conexión";
    }

}

cargarClima();

setInterval(cargarClima,150000);
