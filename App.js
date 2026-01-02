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
  const lastLocationRef = useRef(null);
  const lastQueryTimeRef = useRef(null);
  const lastSpeedMsRef = useRef(0); // Store last raw speed for instant unit toggle recalc

  // Simple haversine distance (in meters)
  const haversineDistance = (coord1, coord2) => {
    if (!coord1 || !coord2) return 0;
    const toRad = (value) => (value * Math.PI) / 180;
    const R = 6371000;
    const φ1 = toRad(coord1.latitude);
    const φ2 = toRad(coord2.latitude);
    const Δφ = toRad(coord2.latitude - coord1.latitude);
    const Δλ = toRad(coord2.longitude - coord1.longitude);

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  };

  // Fetch speed limit
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
        timeInterval: 1000,
        distanceInterval: 0,
      },
      (location) => {
        const rawSpeedMs = (location.coords.speed > 0 ? location.coords.speed : 0);
        lastSpeedMsRef.current = rawSpeedMs;

        const speedKmh = Math.max(0, Math.round(rawSpeedMs * 3.6));
        const speedMph = Math.max(0, Math.round(rawSpeedMs * 2.23694));
        setSpeed(unit === 'km/h' ? speedKmh : speedMph);

        const coords = location.coords;

        const now = Date.now();
        const distanceMoved = lastLocationRef.current ? haversineDistance(lastLocationRef.current, coords) : Infinity;
        const timeSinceLastQuery = lastQueryTimeRef.current ? now - lastQueryTimeRef.current : Infinity;

        if (distanceMoved > 50 || timeSinceLastQuery > 10000) {
          fetchSpeedLimit(coords.latitude, coords.longitude);
          lastLocationRef.current = coords;
          lastQueryTimeRef.current = now;
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
    const newUnit = unit === 'km/h' ? 'mph' : 'km/h';
    setUnit(newUnit);

    // Instant recalc of current speed on toggle (using last known raw speed)
    const rawSpeedMs = lastSpeedMsRef.current;
    const speedKmh = Math.max(0, Math.round(rawSpeedMs * 3.6));
    const speedMph = Math.max(0, Math.round(rawSpeedMs * 2.23694));
    setSpeed(newUnit === 'km/h' ? speedKmh : speedMph);
  };

  useEffect(() => {
    // Run once on mount — no restart on unit change
    startLocationUpdates();

    const levelSub = Battery.addBatteryLevelListener(({ batteryLevel }) => {
      setBatteryLevel(Math.round(batteryLevel * 100));
    });
    Battery.getBatteryLevelAsync().then(level => setBatteryLevel(Math.round(level * 100)));

    return () => {
      stopLocationUpdates();
      levelSub.remove();
    };
  }, []); // Empty dependency array — only once

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