import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Colors, Spacing, Radius, Typography } from '../theme';
import { ApiService } from '../services/api';

const PERIODS = [1, 2, 3, 4, 5, 6, 7];
const DAYS = [
  { id: 'MONDAY', label: 'Mon' },
  { id: 'TUESDAY', label: 'Tue' },
  { id: 'WEDNESDAY', label: 'Wed' },
  { id: 'THURSDAY', label: 'Thu' },
  { id: 'FRIDAY', label: 'Fri' },
];

export default function AvailabilityScreen() {
  const [selectedDay, setSelectedDay] = useState('MONDAY');
  const [selectedPeriod, setSelectedPeriod] = useState(1);
  const [selectedType, setSelectedType] = useState('ALL'); // 'ALL' | 'LABORATORY' | 'CLASSROOM'
  const [selectedStatus, setSelectedStatus] = useState('ALL'); // 'ALL' | 'AVAILABLE' | 'OCCUPIED'
  const [availData, setAvailData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadAvailability();
  }, [selectedDay, selectedPeriod, selectedType, selectedStatus]);

  async function loadAvailability() {
    try {
      setLoading(true);
      const data = await ApiService.getAvailability(
        selectedDay,
        String(selectedPeriod),
        selectedType,
        selectedStatus
      );
      setAvailData(data);
    } catch (err) {
      console.warn('Failed to load spatial availability:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  const onRefresh = () => {
    setRefreshing(true);
    loadAvailability();
  };

  const facilities = availData?.facilities || [];
  const counts = availData?.counts || {
    total: 0,
    available: 0,
    occupied: 0,
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.headerBlock}>
        <Text style={styles.title}>Spatial availability</Text>
        <Text style={styles.subtitle}>Real-time campus lecture hall and computing lab vacancy matrix</Text>
      </View>

      {/* KPI Stats Bar */}
      <View style={styles.kpiRow}>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Total facilities</Text>
          <Text style={styles.kpiValue}>{counts.total}</Text>
        </View>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>Free now</Text>
          <Text style={[styles.kpiValue, styles.kpiSuccess]}>{counts.available}</Text>
        </View>
        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>In session</Text>
          <Text style={[styles.kpiValue, styles.kpiDanger]}>{counts.occupied}</Text>
        </View>
      </View>

      {/* Day Selector */}
      <View style={styles.filterSection}>
        <Text style={styles.filterLabel}>Day of week</Text>
        <View style={styles.pillsRow}>
          {DAYS.map((d) => {
            const active = selectedDay === d.id;
            return (
              <TouchableOpacity
                key={d.id}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setSelectedDay(d.id)}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{d.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Period Selector */}
      <View style={styles.filterSection}>
        <Text style={styles.filterLabel}>Academic period</Text>
        <View style={styles.pillsRow}>
          {PERIODS.map((p) => {
            const active = selectedPeriod === p;
            return (
              <TouchableOpacity
                key={p}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setSelectedPeriod(p)}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>P{p}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Facility Type Filter */}
      <View style={styles.filterSection}>
        <Text style={styles.filterLabel}>Facility filter</Text>
        <View style={styles.pillsRow}>
          {[
            { id: 'ALL', label: 'All types' },
            { id: 'LABORATORY', label: 'Labs' },
            { id: 'CLASSROOM', label: 'Classrooms' },
          ].map((t) => {
            const active = selectedType === t.id;
            return (
              <TouchableOpacity
                key={t.id}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setSelectedType(t.id)}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{t.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Facility List */}
      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="small" color={Colors.accentCyan} />
          <Text style={styles.mutedText}>Computing spatial occupancy...</Text>
        </View>
      ) : facilities.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No matching facilities</Text>
        </View>
      ) : (
        <View style={styles.facilitiesDeck}>
          {facilities.map((f) => {
            const isAvail = f.status === 'AVAILABLE';
            const isRes = f.status === 'EVENT' || f.status === 'RESERVED';

            return (
              <View key={f.facility_id || f.facilityId || f.room_id || f.lab_id} style={styles.facilityCard}>
                <View style={styles.cardHeader}>
                  <View style={styles.flexOne}>
                    <Text style={styles.facilityName}>{f.name}</Text>
                    <Text style={styles.facilityRoom}>{f.room_number || f.location}</Text>
                  </View>
                  <View
                    style={[
                      styles.statusPill,
                      isAvail ? styles.pillAvail : isRes ? styles.pillRes : styles.pillOcc,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusPillText,
                        isAvail ? styles.textAvail : isRes ? styles.textRes : styles.textOcc,
                      ]}
                    >
                      {isRes ? 'Reserved' : f.status}
                    </Text>
                  </View>
                </View>

                <View style={styles.cardBody}>
                  <Text style={styles.metaLine}>
                    Capacity: <Text style={styles.metaBold}>{f.capacity || 70} students</Text>
                  </Text>
                  {f.session ? (
                    <View style={styles.sessionBox}>
                      <Text style={styles.sessionSubject}>
                        {f.session.subject_code} - {f.session.subject_name}
                      </Text>
                      <Text style={styles.sessionFaculty}>
                        Faculty: {f.session.faculty_name}
                      </Text>
                    </View>
                  ) : (
                    <Text style={styles.vacantHint}>Available for allocation in Period {selectedPeriod}</Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgLight,
  },
  content: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxxl,
  },
  headerBlock: {
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textPrimaryLight,
  },
  subtitle: {
    fontSize: 12,
    color: Colors.textMutedLight,
    marginTop: 2,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: Radius.md,
    padding: Spacing.sm,
  },
  kpiLabel: {
    fontSize: 11,
    color: Colors.textMutedLight,
  },
  kpiValue: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.textPrimaryLight,
    marginTop: 2,
    fontFamily: Typography.codeFont,
  },
  kpiSuccess: {
    color: Colors.success,
  },
  kpiDanger: {
    color: Colors.danger,
  },
  filterSection: {
    marginBottom: Spacing.sm,
  },
  filterLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: Colors.textMutedLight,
    marginBottom: Spacing.xs,
  },
  pillsRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    flexWrap: 'wrap',
  },
  chip: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: Radius.sm,
  },
  chipActive: {
    backgroundColor: Colors.brandDeep,
    borderColor: Colors.brandDeep,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '500',
    color: Colors.textSecondaryLight,
  },
  chipTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  facilitiesDeck: {
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  facilityCard: {
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: Radius.lg,
    padding: Spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Spacing.xs,
  },
  flexOne: {
    flex: 1,
  },
  facilityName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimaryLight,
  },
  facilityRoom: {
    fontSize: 12,
    color: Colors.textMutedLight,
    fontFamily: Typography.codeFont,
    marginTop: 1,
  },
  statusPill: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: Radius.sm,
  },
  pillAvail: {
    backgroundColor: Colors.successBg,
  },
  pillRes: {
    backgroundColor: Colors.warningBg,
  },
  pillOcc: {
    backgroundColor: Colors.dangerBg,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  textAvail: {
    color: Colors.success,
  },
  textRes: {
    color: Colors.warning,
  },
  textOcc: {
    color: Colors.danger,
  },
  cardBody: {
    marginTop: Spacing.xs,
  },
  metaLine: {
    fontSize: 12,
    color: Colors.textSecondaryLight,
  },
  metaBold: {
    fontWeight: '600',
    color: Colors.textPrimaryLight,
  },
  sessionBox: {
    marginTop: Spacing.xs,
    backgroundColor: Colors.subtleLight,
    padding: Spacing.sm,
    borderRadius: Radius.sm,
  },
  sessionSubject: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
  },
  sessionFaculty: {
    fontSize: 11,
    color: Colors.textSecondaryLight,
    marginTop: 2,
  },
  vacantHint: {
    fontSize: 11,
    color: Colors.success,
    marginTop: 4,
    fontWeight: '500',
  },
  centerBox: {
    padding: Spacing.xxl,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  mutedText: {
    fontSize: 12,
    color: Colors.textMutedLight,
  },
  emptyCard: {
    padding: Spacing.xl,
    backgroundColor: Colors.surfaceLight,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimaryLight,
  },
});

