import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { activateKeepAwakeAsync, deactivateKeepAwakeAsync } from 'expo-keep-awake';

const KEEP_AWAKE_TAG = 'speedometer';
const QUERY_DISTANCE_METERS = 30;

export default function App() {
  const [speed, setSpeed] = useState(0);
  const [speedLimit, setSpeedLimit] = useState(null);
  const [roadName, setRoadName] = useState(null);
  const [unit, setUnit] = useState('km/h');
  const [isSettingsVisible, setSettingsVisible] = useState(false);
  const [gpsAccuracy, setGpsAccuracy] = useState(null);
  const [hideStatusBar, setHideStatusBar] = useState(true);
  const [keepScreenAwake, setKeepScreenAwake] = useState(true);

  const subscriptionRef = useRef(null);
  const speedBufferRef = useRef([]);
  const lastQueryLocationRef = useRef(null);

  const BUFFER_SIZE = 5;
  const MS_TO_KMH = 3.6;
  const MS_TO_MPH = 2.23694;

  // Haversine distance (meters)
  const getDistanceMeters = (lat1, lon1, lat2, lon2) => {
    const R = 6371000;
    const toRad = (v) => (v * Math.PI) / 180;

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) ** 2;

    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const fetchSpeedLimit = async (latitude, longitude) => {
    try {
      const query = `[out:json];
        way(around:50,${latitude},${longitude})["maxspeed"];
        out tags;`;

      const response = await fetch(
        `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`
      );

      const data = await response.json();

      if (data.elements?.length > 0) {
        const rawLimit = data.elements[0].tags.maxspeed;
        let numericLimit = parseInt(rawLimit);

        if (rawLimit.includes('mph')) {
          numericLimit = Math.round(numericLimit * 1.60934);
        }

        const displayLimit =
          unit === 'km/h'
            ? numericLimit
            : Math.round(numericLimit * 0.621371);

        setSpeedLimit(displayLimit);
      } else {
        setSpeedLimit(null);
      }
    } catch {
      setSpeedLimit(null);
    }
  };

  const fetchRoadName = async (latitude, longitude) => {
    try {
      const addresses = await Location.reverseGeocodeAsync({
        latitude,
        longitude,
      });

      if (addresses.length > 0) {
        const { street, name } = addresses[0];
        setRoadName(street || name || null);
      } else {
        setRoadName(null);
      }
    } catch {
      setRoadName(null);
    }
  };

  const startLocationUpdates = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Denied', 'Location is required.');
      return;
    }

    subscriptionRef.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 800,
        distanceInterval: 0,
      },
      (location) => {
        const { speed: rawSpeed, latitude, longitude, accuracy } =
          location.coords;

        setGpsAccuracy(Math.round(accuracy));

        const validSpeed = rawSpeed && rawSpeed > 0 ? rawSpeed : 0;
        speedBufferRef.current.push(validSpeed);
        if (speedBufferRef.current.length > BUFFER_SIZE) {
          speedBufferRef.current.shift();
        }

        const avgSpeedMs =
          speedBufferRef.current.reduce((a, b) => a + b, 0) /
          speedBufferRef.current.length;

        const displaySpeed =
          unit === 'km/h'
            ? Math.round(avgSpeedMs * MS_TO_KMH)
            : Math.round(avgSpeedMs * MS_TO_MPH);

        setSpeed(displaySpeed);

        // Distance-based polling
        if (!lastQueryLocationRef.current) {
          fetchSpeedLimit(latitude, longitude);
          fetchRoadName(latitude, longitude);
          lastQueryLocationRef.current = { latitude, longitude };
        } else {
          const { latitude: lastLat, longitude: lastLon } =
            lastQueryLocationRef.current;

          const distanceMoved = getDistanceMeters(
            lastLat,
            lastLon,
            latitude,
            longitude
          );

          if (distanceMoved >= QUERY_DISTANCE_METERS) {
            fetchSpeedLimit(latitude, longitude);
            fetchRoadName(latitude, longitude);
            lastQueryLocationRef.current = { latitude, longitude };
          }
        }
      }
    );
  };

  useEffect(() => {
    startLocationUpdates();
    return () => subscriptionRef.current?.remove();
  }, [unit]);

  useEffect(() => {
    keepScreenAwake
      ? activateKeepAwakeAsync(KEEP_AWAKE_TAG)
      : deactivateKeepAwakeAsync(KEEP_AWAKE_TAG);
  }, [keepScreenAwake]);

  useEffect(() => {
    return () => deactivateKeepAwakeAsync(KEEP_AWAKE_TAG);
  }, []);

  const isSpeeding = speedLimit && speed > speedLimit;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar hidden={hideStatusBar} />

      <View style={styles.header}>
        <Text style={styles.accuracyText}>
          GPS: ±{gpsAccuracy ?? '--'}m
        </Text>
        <TouchableOpacity
          onPress={() => setSettingsVisible(true)}
          style={styles.iconBtn}
        >
          <Ionicons name="settings-sharp" size={24} color="#666" />
        </TouchableOpacity>
      </View>

      <View style={styles.speedDisplay}>
        {roadName && (
          <Text style={styles.roadNameText} numberOfLines={2}>
            {roadName}
          </Text>
        )}

        <Text
          adjustsFontSizeToFit
          numberOfLines={1}
          style={[styles.speedText, isSpeeding && styles.speedingText]}
        >
          {speed}
        </Text>

        <Text style={styles.unitText}>{unit}</Text>
      </View>

      <View style={styles.footer}>
        <View style={styles.limitCircle}>
          <Text style={styles.limitLabel}>MAX</Text>
          <Text style={styles.limitNumber}>{speedLimit || '--'}</Text>
        </View>
      </View>

      <Modal visible={isSettingsVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>App Settings</Text>

            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Unit</Text>
              <TouchableOpacity
                style={styles.toggleBtn}
                onPress={() =>
                  setUnit(unit === 'km/h' ? 'mph' : 'km/h')
                }
              >
                <Text style={styles.toggleBtnText}>
                  {unit.toUpperCase()}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Hide Status Bar</Text>
              <TouchableOpacity
                style={styles.toggleBtn}
                onPress={() => setHideStatusBar(!hideStatusBar)}
              >
                <Text style={styles.toggleBtnText}>
                  {hideStatusBar ? 'ON' : 'OFF'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Keep Screen Awake</Text>
              <TouchableOpacity
                style={styles.toggleBtn}
                onPress={() =>
                  setKeepScreenAwake(!keepScreenAwake)
                }
              >
                <Text style={styles.toggleBtnText}>
                  {keepScreenAwake ? 'ON' : 'OFF'}
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => setSettingsVisible(false)}
            >
              <Text style={styles.closeBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 25,
    paddingTop: 20,
  },
  accuracyText: { color: '#444', fontSize: 14 },
  iconBtn: { padding: 5 },

  speedDisplay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  roadNameText: {
    color: '#aaa',
    fontSize: 30,
    fontWeight: '300',
    textAlign: 'center',
    paddingHorizontal: 40,
    marginBottom: 60,
  },
  speedText: {
    color: '#fff',
    fontSize: 180,
    fontWeight: '400',
  },
  speedingText: { color: '#ff4444' },
  unitText: {
    color: '#aaa',
    fontSize: 32,
    marginTop: -20,
  },

  footer: { alignItems: 'center', paddingBottom: 60 },
  limitCircle: {
    width: 85,
    height: 85,
    borderRadius: 42.5,
    borderWidth: 6,
    borderColor: '#ff4444',
    backgroundColor: '#ddd',
    justifyContent: 'center',
    alignItems: 'center',
  },
  limitLabel: { fontSize: 10, color: '#000' },
  limitNumber: { fontSize: 32, fontWeight: '600', color: '#000' },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#1c1c1e',
    padding: 25,
    borderRadius: 20,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 25,
    textAlign: 'center',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  settingLabel: { color: '#ccc', fontSize: 16 },
  toggleBtn: {
    backgroundColor: '#333',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 8,
    minWidth: 70,
    align