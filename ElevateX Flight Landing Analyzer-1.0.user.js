// ==UserScript==
// @name         ElevateX Flight Landing Analyzer
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Analyze flight landing data from ElevateX with wind visualization
// @author       PinkRosa
// @match        https://map.elevatex.app/*
// @grant        GM_xmlhttpRequest
// @connect      api.elevatex.app
// ==/UserScript==

(function() {
    'use strict';

    // Create UI
    function createUI() {
        const container = document.createElement('div');
        container.id = 'landing-analyzer';
        container.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 20px;
            background: linear-gradient(135deg, #1e1e1e 0%, #2d2d2d 100%);
            border: 2px solid #4ec9b0;
            border-radius: 12px;
            padding: 20px;
            z-index: 10000;
            font-family: 'Courier New', monospace;
            color: #d4d4d4;
            min-width: 550px;
            max-width: 650px;
            max-height: 85vh;
            overflow-y: auto;
            box-shadow: 0 8px 16px rgba(0,0,0,0.5);
        `;

        container.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <h3 style="margin: 0; color: #4ec9b0; font-size: 18px;">✈️ Landing Analyzer Pro</h3>
                <div style="display: flex; gap: 5px;">
                    <button id="minimize-btn" style="
                        padding: 4px 8px;
                        background: #3e3e3e;
                        color: #d4d4d4;
                        border: none;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 12px;
                    ">−</button>
                    <button id="close-btn" style="
                        padding: 4px 8px;
                        background: #d13438;
                        color: white;
                        border: none;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 12px;
                    ">✕</button>
                </div>
            </div>
            <button id="analyze-btn" style="
                padding: 10px 20px;
                background: linear-gradient(135deg, #0e639c 0%, #1177bb 100%);
                color: white;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-size: 14px;
                width: 100%;
                font-weight: bold;
                transition: all 0.3s;
            ">🔍 Analyze Current Flight</button>
            <div id="output" style="
                margin-top: 15px;
                padding: 15px;
                background: #252525;
                border: 1px solid #3e3e3e;
                border-radius: 6px;
                font-size: 12px;
                white-space: pre-wrap;
                display: none;
                line-height: 1.6;
            "></div>
        `;

        document.body.appendChild(container);

        // Event listeners
        document.getElementById('analyze-btn').addEventListener('click', analyzeFlight);

        document.getElementById('close-btn').addEventListener('click', () => {
            container.style.display = 'none';
        });

        let isMinimized = false;
        document.getElementById('minimize-btn').addEventListener('click', () => {
            const output = document.getElementById('output');
            const analyzeBtn = document.getElementById('analyze-btn');
            isMinimized = !isMinimized;

            if (isMinimized) {
                output.style.display = 'none';
                analyzeBtn.style.display = 'none';
                container.style.minWidth = '200px';
            } else {
                if (output.innerHTML) output.style.display = 'block';
                analyzeBtn.style.display = 'block';
                container.style.minWidth = '550px';
            }
        });

        // Hover effects
        const buttons = container.querySelectorAll('button');
        buttons.forEach(btn => {
            btn.addEventListener('mouseenter', () => {
                btn.style.transform = 'scale(1.05)';
            });
            btn.addEventListener('mouseleave', () => {
                btn.style.transform = 'scale(1)';
            });
        });
    }

    // Convert wind direction to ASCII arrow
    function getWindArrow(degrees) {
        degrees = ((degrees % 360) + 360) % 360;

        const arrows = [
            { min: 348.75, max: 360, arrow: '↓', dir: 'N' },
            { min: 0, max: 11.25, arrow: '↓', dir: 'N' },
            { min: 11.25, max: 33.75, arrow: '↙', dir: 'NNE' },
            { min: 33.75, max: 56.25, arrow: '↙', dir: 'NE' },
            { min: 56.25, max: 78.75, arrow: '↙', dir: 'ENE' },
            { min: 78.75, max: 101.25, arrow: '←', dir: 'E' },
            { min: 101.25, max: 123.75, arrow: '↖', dir: 'ESE' },
            { min: 123.75, max: 146.25, arrow: '↖', dir: 'SE' },
            { min: 146.25, max: 168.75, arrow: '↖', dir: 'SSE' },
            { min: 168.75, max: 191.25, arrow: '↑', dir: 'S' },
            { min: 191.25, max: 213.75, arrow: '↗', dir: 'SSW' },
            { min: 213.75, max: 236.25, arrow: '↗', dir: 'SW' },
            { min: 236.25, max: 258.75, arrow: '↗', dir: 'WSW' },
            { min: 258.75, max: 281.25, arrow: '→', dir: 'W' },
            { min: 281.25, max: 303.75, arrow: '↘', dir: 'WNW' },
            { min: 303.75, max: 326.25, arrow: '↘', dir: 'NW' },
            { min: 326.25, max: 348.75, arrow: '↘', dir: 'NNW' }
        ];

        for (let i = 0; i < arrows.length; i++) {
            if (degrees >= arrows[i].min && degrees < arrows[i].max) {
                return { arrow: arrows[i].arrow, direction: arrows[i].dir };
            }
        }

        return { arrow: '↓', direction: 'N' };
    }

    // Calculate wind components
    function calculateWindComponents(windDir, windSpeed, runwayHeading) {
        // Convert to radians
        const windRad = (windDir * Math.PI) / 180;
        const runwayRad = (runwayHeading * Math.PI) / 180;

        // Calculate angle difference
        let angleDiff = windDir - runwayHeading;

        // Normalize to -180 to 180
        while (angleDiff > 180) angleDiff -= 360;
        while (angleDiff < -180) angleDiff += 360;

        const angleDiffRad = (angleDiff * Math.PI) / 180;

        // Calculate components
        const headwind = windSpeed * Math.cos(angleDiffRad);
        const crosswind = windSpeed * Math.sin(angleDiffRad);

        return {
            headwind: headwind,
            crosswind: crosswind,
            angleDiff: angleDiff
        };
    }

    // Create wind compass visualization
    function getWindCompass(windDir, windSpeed, runwayHeading) {
        const wind = getWindArrow(windDir);
        const speedKnots = (windSpeed * 1.94384);
        const components = calculateWindComponents(windDir, speedKnots, runwayHeading);

        const headwindStr = components.headwind >= 0 ?
            `↑${Math.abs(components.headwind).toFixed(1)}kt` :
            `↓${Math.abs(components.headwind).toFixed(1)}kt`;

        const crosswindStr = components.crosswind >= 0 ?
            `→${Math.abs(components.crosswind).toFixed(1)}kt` :
            `←${Math.abs(components.crosswind).toFixed(1)}kt`;

        return `
    ╔═════════════════════════╗
    ║  Wind: ${wind.arrow} ${wind.direction.padEnd(4)} ${speedKnots.toFixed(1).padStart(5)}kt   ║
    ║  From: ${windDir.toFixed(0).padStart(3)}°             ║
    ║─────────────────────────║
    ║  Head:  ${headwindStr.padEnd(10)}      ║
    ║  Cross: ${crosswindStr.padEnd(10)}      ║
    ╚═════════════════════════╝`;
    }

    // Get landing quality rating
    function getLandingRating(fpm, gForce, bounces) {
        const absFpm = Math.abs(fpm);

        if (bounces > 2) return { rating: 'HARD', color: '#f48771', emoji: '💥' };
        if (absFpm > 600 || gForce > 2.0) return { rating: 'HARD', color: '#f48771', emoji: '💥' };
        if (absFpm > 400 || gForce > 1.5) return { rating: 'FIRM', color: '#ce9178', emoji: '⚠️' };
        if (absFpm > 200) return { rating: 'GOOD', color: '#4ec9b0', emoji: '✅' };
        return { rating: 'BUTTER', color: '#569cd6', emoji: '🧈' };
    }

    function analyzeFlight() {
        const output = document.getElementById('output');
        output.style.display = 'block';
        output.innerHTML = '<span style="color: #4ec9b0;">⏳ Fetching flight data...</span>';

        const flightId = window.location.pathname.split('/').pop();
        const apiUrl = `https://api.elevatex.app/api/flight/${flightId}/details/public`;

        GM_xmlhttpRequest({
            method: 'GET',
            url: apiUrl,
            onload: function(response) {
                try {
                    const data = JSON.parse(response.responseText);
                    displayFlightData(data);
                } catch (error) {
                    output.innerHTML = `<span style="color: #f48771;">❌ Error parsing data: ${error.message}</span>`;
                }
            },
            onerror: function(error) {
                output.innerHTML = `<span style="color: #f48771;">❌ Error fetching data: ${error.message}</span>`;
            }
        });
    }

    function displayFlightData(data) {
        const output = document.getElementById('output');

        try {
            const events = JSON.parse(data.events);
            const landingEvents = events.filter(event =>
                event.eventType === "Landing" && !JSON.parse(event.args).isInstant
            );

            if (landingEvents.length === 0) {
                output.innerHTML = '<span style="color: #f48771;">❌ No landing events found</span>';
                return;
            }

            let result = '<div style="background: #1e1e1e; padding: 10px; border-radius: 6px; margin-bottom: 10px;">';
            result += '<span style="color: #4ec9b0; font-size: 14px; font-weight: bold;">✅ FLIGHT DATA RETRIEVED</span>\n\n';
            result += `<strong style="color: #569cd6;">Flight:</strong>   ${data.callsign}\n`;
            result += `<strong style="color: #569cd6;">Aircraft:</strong> ${data.aircraftRegistration} (${data.aircraftIcao})\n`;
            result += `<strong style="color: #569cd6;">Route:</strong>    ${data.origin.icao} → ${data.destination.icao}\n`;
            result += `<strong style="color: #569cd6;">Pilot:</strong>    ${data.user.username}\n`;
            result += '</div>';

            landingEvents.forEach((event, index) => {
                const args = JSON.parse(event.args);

                const fpm = args.verticalSpeed * 3.27027; //This might only work on my system but because I dont know how Elevatex pulls the vertical speed (maybe fps dependant) to get an accurate value you need to multiply by this magic number
                const groundSpeedKnots = args.groundSpeed * 1.94384; //converts ground speed from m/s to knots
                const gForce = args.gforce;
                const runwayHeading = args.heading;

                // Get landing rating
                const rating = getLandingRating(fpm, gForce, args.bounces);

                // Color code FPM
                let fpmColor = '#4ec9b0';
                if (Math.abs(fpm) > 300) fpmColor = '#ce9178';
                if (Math.abs(fpm) > 500) fpmColor = '#f48771';

                // Calculate heading difference
                let headingDiff = args.heading - runwayHeading;
                while (headingDiff > 180) headingDiff -= 360;
                while (headingDiff < -180) headingDiff += 360;

                // Wind compass
                const windCompass = getWindCompass(args.windDirection, args.windSpeed, runwayHeading);

                result += `\n<div style="background: #1e1e1e; padding: 15px; border-radius: 6px; margin-top: 10px; border-left: 4px solid ${rating.color};">`;
                result += `<strong style="color: #569cd6; font-size: 14px;">🛬 LANDING ${index + 1}</strong> `;
                result += `<span style="color: ${rating.color}; font-weight: bold;">${rating.emoji} ${rating.rating}</span>\n`;
                result += `${'─'.repeat(55)}\n\n`;

                result += `<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">`;
                result += `<div>`;
                result += `<strong style="color: #ce9178;">Landing Metrics:</strong>\n`;
                result += `  FPM:        <span style="color: ${fpmColor}; font-weight: bold;">${fpm.toFixed(0)} ft/min</span>\n`;
                result += `  G-Force:    <span style="font-weight: bold;">${gForce.toFixed(3)} G</span>\n`;
                result += `  Bounces:    ${args.bounces}\n`;
                result += `  GS:         ${groundSpeedKnots.toFixed(1)} kts\n\n`;

                result += `<strong style="color: #ce9178;">Aircraft Attitude:</strong>\n`;
                result += `  Heading:    ${args.heading.toFixed(1)}°\n`;
                result += `  Bank:       ${args.bank.toFixed(1)}°\n`;
                result += `  Pitch:      ${args.pitch.toFixed(1)}°\n`;
                result += `</div>`;

                result += `<div style="font-size: 11px;">`;
                result += `<strong style="color: #ce9178;">Wind Analysis:</strong>${windCompass}\n`;
                result += `</div>`;
                result += `</div>`;

                result += `\n<div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #3e3e3e; font-size: 11px; color: #888;">`;
                result += `📅 ${new Date(event.DateTime).toLocaleString()} | 🌡️ ${args.temperature.toFixed(1)}°C`;
                result += `</div>`;
                result += `</div>`;
            });

            output.innerHTML = result;

        } catch (error) {
            output.innerHTML = `<span style="color: #f48771;">❌ Error: ${error.message}</span>`;
        }
    }

    // Initialize when page loads
    window.addEventListener('load', () => {
        setTimeout(createUI, 1000);
    });

})();
