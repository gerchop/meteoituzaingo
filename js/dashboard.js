const API_URL = "https://api.weather.com/v2/pws/observations/current?stationId=IITUZAIN9&format=json&units=m&apiKey=1f02ece8a18244d482ece8a18284d480&numericPrecision=decimal";

async function cargarClima(){

    try{

        const response = await fetch(API_URL);

        const data = await response.json();

        const obs = data.observations[0];
        console.log(obs);

        document.querySelector(".temp").textContent =
            obs.metric.temp + "°";

        let estado = "Condiciones normales";

        if(obs.metric.precipRate > 0){
        estado = "🌧 Lloviendo";
        }
        else if(obs.metric.windSpeed > 30){
            estado = "💨 Mucho viento";
        }
        else if(obs.metric.temp >= 32){
            estado = "🥵 Mucho calor";
        }
        else if(obs.metric.temp <= 5){
            estado = "🥶 Mucho frío";
        }
        else{
            estado = "🌤 Tiempo estable";
        }
        
        document.querySelector(".status").textContent = estado;

        document.getElementById("cTemp").textContent =
        obs.metric.temp + "°";
        
        document.getElementById("cHumedad").textContent =
        obs.humidity + "%";
        
        document.getElementById("cViento").textContent =
        obs.metric.windSpeed + " km/h";
        
        document.getElementById("cLluvia").textContent =
        obs.metric.precipTotal + " mm";
        
        document.getElementById("cST").textContent =
        obs.metric.windChill + "°";
        
        document.getElementById("cPresion").textContent =
        obs.metric.pressure + " hPa";
        
        document.getElementById("cSolar").textContent =
        obs.solarRadiation==null ? "--" : obs.solarRadiation;
            }
    
        catch(error){
    
            console.error(error);
    
            document.querySelector(".status").textContent =
                "Error al cargar datos";
    
        }

}

cargarClima();

setInterval(cargarClima,150000);
