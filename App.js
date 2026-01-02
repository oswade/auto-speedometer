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

  // Battery states
  const [batteryLevel, setBatteryLevel] = useState(null);

  const subscriptionRef = useRef(null);
  const lastQueryTime = useRef(null); // For throttling speed limit fetches

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
      console.error('Speed limit error:', err);
      setSpeedLimit(null);
    }
  };

  const startLocationUpdates = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Location permission is needed to show speed.');
      return;
    }

    subscriptionRef.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 1000,  // Update every 1 second
        distanceInterval: 0, // Get updates even with minimal movement
      },
      (location) => {
        const speedMs = location.coords.speed || 0;
        const speedKmh = Math.max(0, Math.round(speedMs * 3.6));
        const speedMph = Math.max(0, Math.round(speedMs * 2.23694));
        setSpeed(unit === 'km/h' ? speedKmh : speedMph);

        const coords = location.coords;

        // Fetch speed limit every 10 seconds
        const now = Date.now();
        if (!lastQueryTime.current || now - lastQueryTime.current > 10000) {
          fetchSpeedLimit(coords.latitude, coords.longitude);
          lastQueryTime.current = now;
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
    // Start location updates immediately on launch
    startLocationUpdates();

    // Monitor battery level
    const levelSub = Battery.addBatteryLevelListener(({ batteryLevel }) => {
      setBatteryLevel(Math.round(batteryLevel * 100));
    });
    Battery.getBatteryLevelAsync().then(level => setBatteryLevel(Math.round(level * 100)));

    return () => {
      stopLocationUpdates();
      levelSub.remove();
    };
  }, [unit]);

  return (
    <View style={styles.container}>
      <Text style={styles.speed}>{speed}</Text>
      <Text style={styles.unit}>{unit}</Text>

      <Text style={styles.speedLimitNumber}>
        {speedLimit !== null ? speedLimit : '--'}
      </Text>
      <Text style={styles.speedLimitText}>Speed Limit</Text>

      <Text style={styles.battery}>
        Battery: {batteryLevel !== null ? `${batteryLevel}%` : '--'}
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
  speed: {
    color: '#fff',
    fontSize: 120,
    fontWeight: 'bold',
  },
  unit: {
    color: '#aaa',
    fontSize: 40,
    marginBottom: 40,
  },
  speedLimitNumber: {
    color: '#ff9900',
    fontSize: 80,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  speedLimitText: {
    color: '#ff9900',
    fontSize: 32,
    marginBottom: 60,
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