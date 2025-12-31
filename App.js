import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import * as Location from 'expo-location';
import * as Battery from 'expo-battery';

export default function App() {
  const [speed, setSpeed] = useState(0);
  const [speedLimit, setSpeedLimit] = useState(null);
  const [unit, setUnit] = useState('km/h');
  const [isAutoConnected, setIsAutoConnected] = useState(false);

  // Weather states
  const [currentTemp, setCurrentTemp] = useState(null);
  const [todayHigh, setTodayHigh] = useState(null);
  const [todayLow, setTodayLow] = useState(null);
  const [weatherCondition, setWeatherCondition] = useState(null);

  // Battery states
  const [batteryLevel, setBatteryLevel] = useState(null);
  const [isCharging, setIsCharging] = useState(false);

  const subscriptionRef = useRef(null);
  const lastQueryLocation = useRef(null);

  // Detect car connection via charging
  const checkAndroidAutoConnection = async () => {
    const powerState = await Battery.getPowerStateAsync();
    const charging = powerState.batteryState === Battery.BatteryState.CHARGING ||
                      powerState.batteryState === Battery.BatteryState.FULL;

    setIsCharging(charging);
    setIsAutoConnected(charging);

    if (charging && !subscriptionRef.current) {
      startLocationUpdates();
    } else if (!charging && subscriptionRef.current) {
      stopLocationUpdates();
      setSpeed(0);
      setSpeedLimit(null);
    }
  };

  // Fetch speed limit from OpenStreetMap
  const fetchSpeedLimit = async (latitude, longitude) => {
    try {
      const overpassQuery = `
        [out:json];
        way(around:80,\( {latitude}, \){longitude})["highway"]["maxspeed"];
        out tags center;
      `;
      const response = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        body: overpassQuery,
      });
      const data = await response.json();

      if (data.elements && data.elements.length > 0) {
        const element = data.elements[0];
        let maxspeed = element.tags.maxspeed;
        if (maxspeed) {
          const match = maxspeed.match(/(\d+)\s*(mph|km\/h|kph)?/i);
          if (match) {
            let value = parseInt(match[1]);
            const apiUnit = match[2] ? match[2].toLowerCase() : 'km/h';
            if (apiUnit.includes('mph')) {
              value = unit === 'km/h' ? Math.round(value * 1.60934) : value;
            } else {
              value = unit === 'mph' ? Math.round(value / 1.60934) : value;
            }
            setSpeedLimit(value);
            return;
          }
        }
      }
      setSpeedLimit(null);
    } catch (err) {
      setSpeedLimit(null);
    }
  };

  // Fetch weather from Open-Meteo
  const fetchWeather = async (latitude, longitude) => {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=\( {latitude}&longitude= \){longitude}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.current) {
        const tempC = Math.round(data.current.temperature_2m);
        setCurrentTemp(unit === 'km/h' ? tempC : Math.round(tempC * 9/5 + 32));

        if (data.daily) {
          const highC = Math.round(data.daily.temperature_2m_max[0]);
          const lowC = Math.round(data.daily.temperature_2m_min[0]);
          setTodayHigh(unit === 'km/h' ? highC : Math.round(highC * 9/5 + 32));
          setTodayLow(unit === 'km/h' ? lowC : Math.round(lowC * 9/5 + 32));
        }

        const code = data.current.weather_code;
        const conditions = {
          0: 'Clear ☀️', 1: 'Mainly clear ☀️', 2: 'Partly cloudy ⛅', 3: 'Overcast ☁️',
          45: 'Fog 🌫️', 51: 'Drizzle 🌧️', 61: 'Rain 🌧️', 71: 'Snow ❄️', 95: 'Storm ⛈️'
        };
        setWeatherCondition(conditions[code] || 'Weather');
      }
    } catch (err) {
      setWeatherCondition('Unavailable');
    }
  };

  const startLocationUpdates = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission denied', 'Location needed for speedometer.');
      return;
    }

    subscriptionRef.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 1000,
        distanceInterval: 5,
      },
      (location) => {
        const speedMs = location.coords.speed || 0;
        const speedKmh = Math.max(0, Math.round(speedMs * 3.6));
        const speedMph = Math.max(0, Math.round(speedMs * 2.23694));
        setSpeed(unit === 'km/h' ? speedKmh : speedMph);

        const coords = location.coords;

        // Throttle speed limit & weather queries
        if (!lastQueryLocation.current ||
            Location.distanceBetween(lastQueryLocation.current, coords) > 30 ||
            Date.now() - (lastQueryLocation.current.timestamp || 0) > 60000) {
          fetchSpeedLimit(coords.latitude, coords.longitude);
          fetchWeather(coords.latitude, coords.longitude);
          lastQueryLocation.current = { ...coords, timestamp: Date.now() };
        }
      }
    );
  };

  const stopLocationUpdates = () => {
    if (subscriptionRef.current) {
      subscriptionRef.current.remove();
      subscriptionRef.current = null;
    }
  };

  const toggleUnit = () => {
    setUnit(unit === 'km/h' ? 'mph' : 'km/h');
  };

  useEffect(() => {
    // Initial check
    checkAndroidAutoConnection();

    // Monitor battery/charging changes
    const batterySub = Battery.addBatteryStateListener(({ batteryState }) => {
      checkAndroidAutoConnection();
    });

    // Monitor battery level
    const levelSub = Battery.addBatteryLevelListener(({ batteryLevel }) => {
      setBatteryLevel(Math.round(batteryLevel * 100));
    });
    Battery.getBatteryLevelAsync().then(level => setBatteryLevel(Math.round(level * 100)));

    // Poll connection every 10 seconds
    const interval = setInterval(checkAndroidAutoConnection, 10000);

    return () => {
      clearInterval(interval);
      batterySub.remove();
      levelSub.remove();
      stopLocationUpdates();
    };
  }, [unit]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        {isAutoConnected ? 'In Car Mode' : 'Waiting for Car Connection...'}
      </Text>

      <Text style={styles.speed}>{speed}</Text>
      <Text style={styles.unit}>{unit}</Text>

      <Text style={styles.speedLimit}>
        Speed Limit: {speedLimit !== null ? `${speedLimit} ${unit}` : '--'}
      </Text>

      <View style={styles.weatherSection}>
        <Text style={styles.weatherTitle}>Weather Today</Text>
        {currentTemp !== null ? (
          <>
            <Text style={styles.currentTemp}>
              {currentTemp}°{unit === 'km/h' ? 'C' : 'F'}  {weatherCondition}
            </Text>
            <Text style={styles.highLow}>
              High {todayHigh}°  Low {todayLow}°
            </Text>
          </>
        ) : (
          <Text style={styles.weatherTitle}>Loading weather...</Text>
        )}
      </View>

      <Text style={styles.battery}>
        Battery: {batteryLevel !== null ? `${batteryLevel}%` : '--'} {isCharging ? '⚡ Charging' : ''}
      </Text>

      <TouchableOpacity style={styles.button} onPress={toggleUnit}>
        <Text style={styles.buttonText}>
          Switch to {unit === 'km/h' ? 'mph' : 'km/h'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  title: {
    color: '#0f0',
    fontSize: 22,
    marginBottom: 40,
    fontWeight: '600',
  },
  speed: {
    color: '#fff',
    fontSize: 120,
    fontWeight: 'bold',
  },
  unit: {
    color: '#aaa',
    fontSize: 40,
    marginBottom: 20,
  },
  speedLimit: {
    color: '#ff9900',
    fontSize: 36,
    fontWeight: '600',
    marginBottom: 40,
  },
  weatherSection: {
    alignItems: 'center',
    marginBottom: 40,
  },
  weatherTitle: {
    color: '#aaa',
    fontSize: 20,
  },
  currentTemp: {
    color: '#fff',
    fontSize: 32,
    fontWeight: 'bold',
    marginVertical: 8,
  },
  highLow: {
    color: '#ccc',
    fontSize: 24,
  },
  battery: {
    color: '#0f0',
    fontSize: 24,
    marginBottom: 40,
    fontWeight: '500',
  },
  button: {
    backgroundColor: '#333',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 30,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
  },
});