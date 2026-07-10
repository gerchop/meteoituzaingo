const API_URL =
"https://api.weather.com/v2/pws/observations/current?stationId=IITUZAIN9&format=json&units=m&apiKey=1f02ece8a18244d482ece8a18284d480&numericPrecision=decimal";

function direccion(grados){

    const dir=[
        "N","NNE","NE","ENE",
        "E","ESE","SE","SSE",
        "S","SSO","SO","OSO",
        "O","ONO","NO","NNO"
    ];

    return dir[Math.round(grados/22.5)%16];

}

function estadoTiempo(obs){

    if(obs.metric.precipRate>0)
        return "🌧 Lloviendo";

    if(obs.metric.windSpeed>=40)
        return "💨 Muy ventoso";

    if(obs.metric.temp>=35)
        return "🥵 Muy caluroso";

    if(obs.metric.temp<=3)
        return "🥶 Muy frío";

    return "🌤 Tiempo estable";

}

function formatoFecha(fecha){

    return fecha.toLocaleDateString("es-AR",{
        day:"2-digit",
        month:"2-digit",
        year:"numeric"
    });

}

function formatoHora(fecha){

    return fecha.toLocaleTimeString("es-AR",{
        hour:"2-digit",
        minute:"2-digit",
        second:"2-digit"
    });

}

async function cargarClima(){

    try{

        const response=await fetch(API_URL);

        if(!response.ok)
            throw new Error(response.status);

        const data=await response.json();

        const obs=data.observations[0];

        // CABECERA

        document.querySelector(".temp").textContent =
            obs.metric.temp.toFixed(1)+"°";

        document.querySelector(".status").textContent =
            estadoTiempo(obs);

        const fecha=new Date(obs.obsTimeLocal);

        document.getElementById("actualizacion").textContent =
            "Última actualización: "+
            formatoFecha(fecha)+"  "+
            formatoHora(fecha);

        // TARJETAS

        document.getElementById("cTemp").textContent =
            obs.metric.temp.toFixed(1)+"°";

        document.getElementById("cST").textContent =
            obs.metric.windChill.toFixed(1)+"°";

        document.getElementById("cHumedad").textContent =
            obs.humidity+" %";

        document.getElementById("cViento").textContent =
            obs.metric.windSpeed.toFixed(1)+" km/h";

        document.getElementById("cDireccion").textContent =
            direccion(obs.winddir);

        document.getElementById("cLluvia").textContent =
            obs.metric.precipTotal.toFixed(1)+" mm";

        document.getElementById("cPresion").textContent =
            obs.metric.pressure.toFixed(1)+" hPa";

        document.getElementById("cSolar").textContent =
            obs.solarRadiation==null
            ? "--"
            : obs.solarRadiation.toFixed(0)+" W/m²";

    }
    catch(e){

        console.error(e);

        document.querySelector(".status").textContent =
            "Sin conexión con Weather.com";

    }

}

cargarClima();

setInterval(cargarClima,10000);
