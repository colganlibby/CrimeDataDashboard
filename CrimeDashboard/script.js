// Default Coordinates
const DEFAULT_LAT = 51.505;
const DEFAULT_LNG = -0.09;

// Map Setup
const map = L.map('map').setView([DEFAULT_LAT, DEFAULT_LNG], 13);
L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
  attribution: '&copy; OpenStreetMap & Carto',
  maxZoom: 19
}).addTo(map);

let currentMarker = null;
let crimeChart = null;
let crimeHeatLayer = null;

// Initial Load
loadCrimeData(DEFAULT_LAT, DEFAULT_LNG);

// Search Trigger
async function searchLocation() {
  const input = document.getElementById('locationInput').value;
  if (!input) {
    alert("Please enter a location.");
    return;
  }

  const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(input)}`);
  const geoData = await geoRes.json();

  if (!geoData.length) {
    alert("Location not found.");
    return;
  }

  const lat = parseFloat(geoData[0].lat);
  const lng = parseFloat(geoData[0].lon);

  map.setView([lat, lng], 14);
  if (currentMarker) map.removeLayer(currentMarker);
  currentMarker = L.marker([lat, lng]).addTo(map).bindPopup("Selected Location").openPopup();

  loadCrimeData(lat, lng);
}

// Re-fetch on dropdown change
function refetchCrimeType() {
  if (currentMarker) {
    const { lat, lng } = currentMarker.getLatLng();
    loadCrimeData(lat, lng);
  } else {
    loadCrimeData(DEFAULT_LAT, DEFAULT_LNG);
  }
}

// Load Crime Data
async function loadCrimeData(lat, lng) {
  const selectedType = document.getElementById("crimeTypeSelect").value;
  const timeRange = document.getElementById("timeRangeSelect").value;

  // Build list of dates to fetch
  let monthsToFetch = [];

  if (timeRange === "year") {
    for (let i = 0; i < 12; i++) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      monthsToFetch.push(`${y}-${m}`);
    }
  } else {
    monthsToFetch.push("2023-10");  // Hardcoded for stable API response
  }

  try {
    let allData = [];

    for (const date of monthsToFetch) {
      const res = await fetch(`https://data.police.uk/api/crimes-street/all-crime?lat=${lat}&lng=${lng}&date=${date}`);
      const data = await res.json();
      allData = allData.concat(data);
    }

    // Filter by type if selected
    if (selectedType) {
      allData = allData.filter(crime => crime.category === selectedType);
    }

    // Clear old visuals
    if (crimeChart) crimeChart.destroy();
    if (crimeHeatLayer) map.removeLayer(crimeHeatLayer);

    document.querySelector(".card:nth-child(1) p").textContent = allData.length;

    if (!allData.length) {
      document.querySelector(".card:nth-child(2) p").textContent = "N/A";
      document.querySelector(".card:nth-child(3) p").textContent = "N/A";
      alert("No crime data found for this filter/location.");
      return;
    }

    // Clear old markers
    map.eachLayer(layer => {
      if (layer instanceof L.Marker && layer !== currentMarker) {
        map.removeLayer(layer);
      }
    });

    // Add new markers
    allData.forEach(crime => {
      if (crime.location) {
        L.marker([crime.location.latitude, crime.location.longitude])
          .addTo(map)
          .bindPopup(`<b>${crime.category}</b><br>${crime.location.street.name}`);
      }
    });

    // Add heatmap
    const heatPoints = allData
      .filter(c => c.location)
      .map(c => [parseFloat(c.location.latitude), parseFloat(c.location.longitude), 0.4]);

    crimeHeatLayer = L.heatLayer(heatPoints, {
      radius: 25,
      blur: 15,
      maxZoom: 17,
      gradient: {
        0.2: 'blue',
        0.4: 'lime',
        0.6: 'orange',
        0.8: 'red'
      }
    }).addTo(map);

    // Category + Area Count
    const categoryCounts = {};
    const areaCounts = {};

    allData.forEach(crime => {
      const category = crime.category;
      const street = crime.location?.street?.name || "Unknown";
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;
      areaCounts[street] = (areaCounts[street] || 0) + 1;
    });

    const labels = Object.keys(categoryCounts);
    const values = Object.values(categoryCounts);
    const topCrime = labels[values.indexOf(Math.max(...values))];
    const topArea = Object.keys(areaCounts).reduce((a, b) => areaCounts[a] > areaCounts[b] ? a : b);

    document.querySelector(".card:nth-child(2) p").textContent = topArea;
    document.querySelector(".card:nth-child(3) p").textContent = topCrime;

    const ctx = document.getElementById('crimeChart').getContext('2d');
    crimeChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Crime Count',
          data: values,
          backgroundColor: 'rgba(52, 152, 219, 0.7)',
          borderColor: 'rgba(41, 128, 185, 1)',
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        scales: {
          y: { beginAtZero: true }
        }
      }
    });

  } catch (err) {
    console.error("Error fetching data:", err);
    alert("Failed to load crime data.");
  }
}


function toggleMode() {
  document.body.classList.toggle("dark-mode");
}