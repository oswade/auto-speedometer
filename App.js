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

export default function App() {
  const [speed, setSpeed] = useState(0);
  const [speedLimit, setSpeedLimit] = useState(null);
  const [unit, setUnit] = useState('km/h');
  const [isSettingsVisible, setSettingsVisible] = useState(false);
  const [gpsAccuracy, setGpsAccuracy] = useState(null);
  const [hideStatusBar, setHideStatusBar] = useState(true);

  const subscriptionRef = useRef(null);
  const lastQueryTimeRef = useRef(null);
  const speedBufferRef = useRef([]); 
  const BUFFER_SIZE = 5;

  const MS_TO_KMH = 3.6;
  const MS_TO_MPH = 2.23694;

  const fetchSpeedLimit = async (latitude, longitude) => {
    try {
      const query = `[out:json];way(around:50,${latitude},${longitude})["maxspeed"];out tags;`;
      const response = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
      const data = await response.json();

      if (data.elements?.length > 0) {
        const rawLimit = data.elements[0].tags.maxspeed;
        let numericLimit = parseInt(rawLimit);
        if (rawLimit.includes('mph')) numericLimit = Math.round(numericLimit * 1.60934);
        
        const displayLimit = unit === 'km/h' ? numericLimit : Math.round(numericLimit * 0.621371);
        setSpeedLimit(displayLimit);
      } else {
        setSpeedLimit(null);
      }
    } catch (err) {
      setSpeedLimit(null);
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
        const { speed: rawSpeed, latitude, longitude, accuracy } = location.coords;
        setGpsAccuracy(Math.round(accuracy));

        const validSpeed = rawSpeed && rawSpeed > 0 ? rawSpeed : 0;
        speedBufferRef.current.push(validSpeed);
        if (speedBufferRef.current.length > BUFFER_SIZE) speedBufferRef.current.shift();

        const sum = speedBufferRef.current.reduce((a, b) => a + b, 0);
        const averagedSpeedMs = sum / speedBufferRef.current.length;

        const displaySpeed = unit === 'km/h' 
          ? Math.round(averagedSpeedMs * MS_TO_KMH) 
          : Math.round(averagedSpeedMs * MS_TO_MPH);
        
        setSpeed(displaySpeed);

        const now = Date.now();
        if (!lastQueryTimeRef.current || now - lastQueryTimeRef.current > 15000) {
          fetchSpeedLimit(latitude, longitude);
          lastQueryTimeRef.current = now;
        }
      }
    );
  };

  useEffect(() => {
    startLocationUpdates();
    return () => subscriptionRef.current?.remove();
  }, [unit]);

  const isSpeeding = speedLimit && speed > speedLimit;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar hidden={hideStatusBar} />
      
      <View style={styles.header}>
        <View>
          <Text style={styles.accuracyText}>GPS: ±{gpsAccuracy}m</Text>
        </View>
        <TouchableOpacity onPress={() => setSettingsVisible(true)} style={styles.iconBtn}>
          <Ionicons name="settings-sharp" size={24} color="#666" />
        </TouchableOpacity>
      </View>

      <View style={styles.speedDisplay}>
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

      <Modal visible={isSettingsVisible} animationType="fade" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>App Settings</Text>
            
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Unit</Text>
              <TouchableOpacity 
                style={styles.toggleBtn} 
                onPress={() => setUnit(unit === 'km/h' ? 'mph' : 'km/h')}
              >
                <Text style={styles.toggleBtnText}>{unit.toUpperCase()}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Hide Status Bar</Text>
              <TouchableOpacity 
                style={styles.toggleBtn} 
                onPress={() => setHideStatusBar(!hideStatusBar)}
              >
                <Text style={styles.toggleBtnText}>{hideStatusBar ? "ON" : "OFF"}</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.closeBtn} onPress={() => setSettingsVisible(false)}>
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
    paddingTop: 20 
  },
  accuracyText: { color: '#444', fontSize: 12, fontWeight: 'bold' },
  iconBtn: { padding: 5 },
  speedDisplay: { flex: 2, justifyContent: 'center', alignItems: 'center' },
  speedText: { 
    color: '#fff', 
    fontSize: 180, // Larger speed
    fontWeight: '900', 
    includeFontPadding: false 
  },
  speedingText: { color: '#ff4444' },
  unitText: { color: '#666', fontSize: 32, marginTop: -20, fontWeight: '600' },
  footer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 40 },
  limitCircle: {
    width: 85, // Smaller limit sign
    height: 85, 
    borderRadius: 42.5, 
    borderWidth: 6,
    borderColor: '#ff4444', 
    backgroundColor: '#fff',
    justifyContent: 'center', 
    alignItems: 'center',
  },
  limitLabel: { fontSize: 10, fontWeight: '900', color: '#000' },
  limitNumber: { fontSize: 32, fontWeight: '900', color: '#000' },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#1c1c1e', padding: 25, borderRadius: 20 },
  modalTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold', marginBottom: 25, textAlign: 'center' },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  settingLabel: { color: '#ccc', fontSize: 16 },
  toggleBtn: { backgroundColor: '#333', paddingVertical: 8, paddingHorizontal: 15, borderRadius: 8, minWidth: 70, alignItems: 'center' },
  toggleBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  closeBtn: { backgroundColor: '#fff', padding: 15, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  closeBtnText: { color: '#000', fontWeight: 'bold', fontSize: 16 }
});
