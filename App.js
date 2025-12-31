import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  AppState,
} from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Battery from 'expo-battery';

const LOCATION_TASK_NAME = 'auto-speedometer-task';

TaskManager.defineTask(LOCATION_TASK_NAME, ({ data, error }) => {
  if (error) return;
  if (data) {
    const { locations } = data;
    // You can broadcast speed here if needed
  }
});

export default function App() {
  const [speed, setSpeed] = useState(0);
  const [unit, setUnit] = useState('km/h'); // km/h or mph
  const [isAutoConnected, setIsAutoConnected] = useState(false);
  const subscriptionRef = useRef(null);
  const appStateRef = useRef(AppState.currentState);

  // Detect Android Auto connection via USB + power + Android Auto app likely running
  const checkAndroidAutoConnection = async () => {
    const batteryState = await Battery.getBatteryStateAsync();
    const isPlugged = await Battery.isBatteryChargingAsync(); // Usually true in car USB
    // Heuristic: Charging via USB + app in foreground → likely Android Auto
    const likelyInCar = isPlugged && batteryState === Battery.BatteryState.CHARGING;

    if (likelyInCar && !isAutoConnected) {
      setIsAutoConnected(true);
      startLocationUpdates();
    } else if (!likelyInCar && isAutoConnected) {
      setIsAutoConnected(false);
      stopLocationUpdates();
      setSpeed(0);
    }
  };

  const startLocationUpdates = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission denied', 'Location permission required for speedometer.');
      return;
    }

    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
      accuracy: Location.Accuracy.High,
      timeInterval: 1000,
      distanceInterval: 0,
      foregroundService: {
        notificationTitle: 'Speedometer Active',
        notificationBody: 'Tracking speed in Android Auto mode',
      },
    });

    subscriptionRef.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 1000,
        distanceInterval: 0,
      },
      (location) => {
        const speedMs = location.coords.speed || 0;
        const speedKmh = Math.max(0, Math.round(speedMs * 3.6));
        const speedMph = Math.max(0, Math.round(speedMs * 2.23694));
        setSpeed(unit === 'km/h' ? speedKmh : speedMph);
      }
    );
  };

  const stopLocationUpdates = async () => {
    if (subscriptionRef.current) {
      subscriptionRef.current.remove();
      subscriptionRef.current = null;
    }
    if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    }
  };

  const toggleUnit = () => {
    setUnit(unit === 'km/h' ? 'mph' : 'km/h');
  };

  useEffect(() => {
    // Initial check
    checkAndroidAutoConnection();

    // Poll every 5 seconds for connection changes
    const interval = setInterval(checkAndroidAutoConnection, 5000);

    // Optional: Listen to app state (foreground/background)
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (appStateRef.current.match(/inactive|background/) && nextAppState === 'active') {
        checkAndroidAutoConnection();
      }
      appStateRef.current = nextAppState;
    });

    return () => {
      clearInterval(interval);
      subscription.remove();
      stopLocationUpdates();
    };
  }, [isAutoConnected, unit]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        {isAutoConnected ? 'Android Auto Connected' : 'Waiting for Android Auto...'}
      </Text>

      <Text style={styles.speed}>{speed}</Text>
      <Text style={styles.unit}>{unit}</Text>

      <TouchableOpacity style={styles.button} onPress={toggleUnit}>
        <Text style={styles.buttonText}>
          Switch to {unit === 'km/h' ? 'mph' : 'km/h'}
        </Text>
      </TouchableOpacity>

      <Text style={styles.info}>
        Connect your phone to Android Auto to start.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: '#0f0',
    fontSize: 20,
    marginBottom: 40,
  },
  speed: {
    color: '#fff',
    fontSize: 120,
    fontWeight: 'bold',
  },
  unit: {
    color: '#aaa',
    fontSize: 40,
    marginBottom: 60,
  },
  button: {
    backgroundColor: '#333',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 30,
    marginBottom: 40,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
  },
  info: {
    color: '#666',
    fontSize: 16,
    position: 'absolute',
    bottom: 50,
  },
});