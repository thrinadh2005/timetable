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

const DEPARTMENTS = ['CSE', 'AIML', 'AIDS', 'IT', 'CYBER', 'MECH', 'CIVIL', 'ECE', 'EEE'];
const SEMESTERS = [
  { id: 'SEM_1', label: '1st Sem' },
  { id: 'SEM_2', label: '2nd Sem' },
  { id: 'SEM_3', label: '3rd Sem' },
  { id: 'SEM_4', label: '4th Sem' },
  { id: 'SEM_5', label: '5th Sem' },
  { id: 'SEM_6', label: '6th Sem' },
  { id: 'SEM_7', label: '7th Sem' },
  { id: 'SEM_8', label: '8th Sem' },
];
const SECTIONS = ['A', 'B', 'C', 'D'];
const DAYS = [
  { id: 'MONDAY', label: 'Monday', short: 'Mon' },
  { id: 'TUESDAY', label: 'Tuesday', short: 'Tue' },
  { id: 'WEDNESDAY', label: 'Wednesday', short: 'Wed' },
  { id: 'THURSDAY', label: 'Thursday', short: 'Thu' },
  { id: 'FRIDAY', label: 'Friday', short: 'Fri' },
];

const PERIODS = [1, 2, 3, 4, 5, 6, 7];
const PERIOD_TIMES = {
  1: '09:00 - 10:00',
  2: '10:00 - 11:00',
  3: '11:10 - 12:10',
  4: '12:10 - 01:10',
  5: '02:00 - 03:00',
  6: '03:00 - 04:00',
  7: '04:00 - 05:00',
};

export default function TimetableScreen({ currentUser, isDesktop }) {
  const [selectedDept, setSelectedDept] = useState(currentUser?.departmentId || 'CSE');
  const [selectedSem, setSelectedSem] = useState('SEM_3');
  const [selectedSec, setSelectedSec] = useState('A');
  const [selectedDay, setSelectedDay] = useState('MONDAY');
  const [viewMode, setViewMode] = useState(isDesktop ? 'MATRIX' : 'DAILY'); // 'MATRIX' | 'DAILY'
  const [timetableData, setTimetableData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (currentUser?.role === 'STUDENT') {
      setSelectedDept('CSE');
      setSelectedSem('SEM_3');
      setSelectedSec('A');
    }
    loadTimetable();
  }, [selectedDept, selectedSem, selectedSec]);

  async function loadTimetable() {
    try {
      setLoading(true);
      const data = await ApiService.getTimetableGrid(selectedDept, selectedSem, selectedSec);
      setTimetableData(data);
    } catch (err) {
      console.warn('Failed to load timetable:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  const onRefresh = () => {
    setRefreshing(true);
    loadTimetable();
  };

  const allSlots = timetableData?.slots || [];
  const daySlots = allSlots
    .filter((slot) => (slot.day_of_week || '').toUpperCase() === selectedDay)
    .sort((a, b) => (a.period_index || 0) - (b.period_index || 0));

  // Helper to find slot for matrix cell
  function getSlotFor(dayId, periodIdx) {
    return allSlots.find(
      (s) =>
        (s.day_of_week || '').toUpperCase() === dayId &&
        Number(s.period_index) === Number(periodIdx)
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, isDesktop && styles.contentDesktop]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Top Controls Toolbar */}
      <View style={[styles.toolbarCard, isDesktop && styles.toolbarCardDesktop]}>
        {/* Department Chips */}
        <View style={styles.filterGroup}>
          <Text style={styles.filterGroupLabel}>Department</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillRow}>
            {DEPARTMENTS.map((dept) => {
              const active = selectedDept === dept;
              return (
                <TouchableOpacity
                  key={dept}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setSelectedDept(dept)}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{dept}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Semester, Section, and View Mode */}
        <View style={[styles.dualFilterRow, isDesktop && styles.dualFilterRowDesktop]}>
          <View style={styles.inlineFilter}>
            <Text style={styles.filterGroupLabel}>Semester</Text>
            <View style={styles.rowWrap}>
              {SEMESTERS.map((s) => {
                const active = selectedSem === s.id;
                return (
                  <TouchableOpacity
                    key={s.id}
                    style={[styles.smallChip, active && styles.smallChipActive]}
                    onPress={() => setSelectedSem(s.id)}
                  >
                    <Text style={[styles.smallChipText, active && styles.smallChipTextActive]}>
                      {s.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.inlineFilter}>
            <Text style={styles.filterGroupLabel}>Section</Text>
            <View style={styles.rowWrap}>
              {SECTIONS.map((sec) => {
                const active = selectedSec === sec;
                return (
                  <TouchableOpacity
                    key={sec}
                    style={[styles.smallChip, active && styles.smallChipActive]}
                    onPress={() => setSelectedSec(sec)}
                  >
                    <Text style={[styles.smallChipText, active && styles.smallChipTextActive]}>
                      Sec {sec}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Mode Switcher: 5-Day Matrix vs Daily Flight */}
          <View style={styles.inlineFilter}>
            <Text style={styles.filterGroupLabel}>Format</Text>
            <View style={styles.rowWrap}>
              <TouchableOpacity
                style={[styles.smallChip, viewMode === 'MATRIX' && styles.smallChipActive]}
                onPress={() => setViewMode('MATRIX')}
              >
                <Text style={[styles.smallChipText, viewMode === 'MATRIX' && styles.smallChipTextActive]}>
                  5-Day Matrix
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.smallChip, viewMode === 'DAILY' && styles.smallChipActive]}
                onPress={() => setViewMode('DAILY')}
              >
                <Text style={[styles.smallChipText, viewMode === 'DAILY' && styles.smallChipTextActive]}>
                  Daily View
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>

      {/* Meta Header */}
      <View style={styles.cardHeaderStrip}>
        <View>
          <Text style={styles.metaTitle}>
            {selectedDept} {selectedSem === 'SEM_3' ? 'Semester 3' : 'Semester 5'} &bull; Section {selectedSec}
          </Text>
          <Text style={styles.metaSub}>
            Autonomous Academic Schedule &bull; {allSlots.length} Total Curricular Slots
          </Text>
        </View>
        {viewMode === 'DAILY' && (
          <View style={styles.badgePill}>
            <Text style={styles.badgePillText}>{selectedDay}</Text>
          </View>
        )}
      </View>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="small" color={Colors.accentCyan} />
          <Text style={styles.mutedText}>Fetching institutional timetable...</Text>
        </View>
      ) : allSlots.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No scheduled periods</Text>
          <Text style={styles.emptySubtitle}>No classes or laboratory sessions assigned for this section.</Text>
        </View>
      ) : viewMode === 'MATRIX' ? (
        /* ================= 5-DAY MATRIX TABLE (DESKTOP & TABLET FRIENDLY) ================= */
        <ScrollView horizontal showsHorizontalScrollIndicator={true} style={styles.matrixScroll}>
          <View style={styles.matrixTable}>
            {/* Table Header Row: Days */}
            <View style={styles.matrixHeaderRow}>
              <View style={[styles.matrixHeaderCell, styles.matrixTimeCol]}>
                <Text style={styles.matrixHeaderText}>Period / Time</Text>
              </View>
              {DAYS.map((d) => (
                <View key={d.id} style={styles.matrixHeaderCell}>
                  <Text style={styles.matrixHeaderText}>{d.label}</Text>
                </View>
              ))}
            </View>

            {/* Table Body: Periods 1 to 7 */}
            {PERIODS.map((periodIdx) => {
              const isTeaBreakBefore = periodIdx === 3;
              const isLunchBreakBefore = periodIdx === 5;

              return (
                <React.Fragment key={periodIdx}>
                  {/* Tea Break Intermission */}
                  {isTeaBreakBefore && (
                    <View style={styles.matrixBreakRow}>
                      <Text style={styles.matrixBreakText}>
                        Morning Tea Break (11:00 AM - 11:10 AM)
                      </Text>
                    </View>
                  )}

                  {/* Lunch Break Intermission */}
                  {isLunchBreakBefore && (
                    <View style={styles.matrixBreakRow}>
                      <Text style={styles.matrixBreakText}>
                        Campus Lunch Intermission (01:10 PM - 02:00 PM)
                      </Text>
                    </View>
                  )}

                  {/* Period Row */}
                  <View style={styles.matrixRow}>
                    {/* Period Label Column */}
                    <View style={[styles.matrixCell, styles.matrixTimeCol]}>
                      <Text style={styles.matrixPeriodIndex}>P{periodIdx}</Text>
                      <Text style={styles.matrixPeriodTime}>{PERIOD_TIMES[periodIdx]}</Text>
                    </View>

                    {/* 5 Day Slot Cells */}
                    {DAYS.map((d) => {
                      const slot = getSlotFor(d.id, periodIdx);
                      const isLab =
                        slot?.is_laboratory === 1 || slot?.is_laboratory === true;
                      const hasSub = !!(slot?.substitute_faculty_name || slot?.is_substituted);

                      return (
                        <View
                          key={d.id}
                          style={[
                            styles.matrixCell,
                            !slot && styles.matrixCellEmpty,
                            isLab && styles.matrixCellLab,
                          ]}
                        >
                          {slot ? (
                            <View style={styles.matrixSlotContent}>
                              <Text style={[styles.matrixSubjectCode, isLab && styles.codeLab]}>
                                {slot.subject_code}
                              </Text>
                              <Text
                                style={styles.matrixSubjectName}
                                numberOfLines={2}
                              >
                                {slot.subject_name}
                              </Text>
                              <View style={styles.matrixMetaRow}>
                                <Text style={styles.matrixVenue} numberOfLines={1}>
                                  {slot.room_number || 'Room'}
                                </Text>
                                <Text style={styles.matrixFaculty} numberOfLines={1}>
                                  {hasSub
                                    ? slot.substitute_faculty_name || slot.faculty_name
                                    : slot.faculty_name}
                                </Text>
                              </View>
                              {isLab && (
                                <View style={styles.labBadgeMini}>
                                  <Text style={styles.labBadgeMiniText}>Lab Session</Text>
                                </View>
                              )}
                            </View>
                          ) : (
                            <Text style={styles.matrixEmptyText}>Free</Text>
                          )}
                        </View>
                      );
                    })}
                  </View>
                </React.Fragment>
              );
            })}
          </View>
        </ScrollView>
      ) : (
        /* ================= DAILY FLIGHT LIST (MOBILE & TOUCH FRIENDLY) ================= */
        <View>
          {/* Day Selector Pills */}
          <View style={styles.dayNavRow}>
            {DAYS.map((d) => {
              const active = selectedDay === d.id;
              return (
                <TouchableOpacity
                  key={d.id}
                  style={[styles.dayChip, active && styles.dayChipActive]}
                  onPress={() => setSelectedDay(d.id)}
                >
                  <Text style={[styles.dayChipText, active && styles.dayChipTextActive]}>
                    {d.short}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Daily Slots */}
          <View style={styles.slotsList}>
            {daySlots.map((slot, index) => {
              const isLab =
                slot.is_laboratory === 1 || slot.is_laboratory === true;
              const hasSub = !!(slot.substitute_faculty_name || slot.is_substituted);

              return (
                <View
                  key={`${slot.period_index}-${index}`}
                  style={[styles.slotCard, isLab && styles.slotCardLab]}
                >
                  <View style={styles.slotHeader}>
                    <View style={styles.periodBadge}>
                      <Text style={styles.periodIndexText}>P{slot.period_index}</Text>
                    </View>
                    <Text style={styles.slotTimeText}>
                      {PERIOD_TIMES[slot.period_index] || ''}
                    </Text>
                    <View style={[styles.venuePill, isLab && styles.venuePillLab]}>
                      <Text style={[styles.venuePillText, isLab && styles.venuePillTextLab]}>
                        {slot.room_number || slot.room_id || 'Venue'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.slotBody}>
                    <Text style={styles.subjectCode}>{slot.subject_code}</Text>
                    <Text style={styles.subjectName}>{slot.subject_name}</Text>
                    <Text style={styles.facultyName}>
                      Faculty:{' '}
                      <Text style={styles.facultyHighlight}>{slot.faculty_name}</Text>
                    </Text>
                  </View>

                  {hasSub && (
                    <View style={styles.substituteBox}>
                      <Text style={styles.substituteText}>
                        Substitute: {slot.substitute_faculty_name || 'Assigned'} (
                        {slot.substitution_reason || 'Leave'})
                      </Text>
                    </View>
                  )}

                  {isLab && (
                    <View style={styles.labTagRow}>
                      <Text style={styles.labTagText}>Practical Laboratory Session</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
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
    padding: Spacing.md,
    paddingBottom: Spacing.xxxl,
  },
  contentDesktop: {
    padding: Spacing.xl,
  },
  toolbarCard: {
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  toolbarCardDesktop: {
    padding: Spacing.lg,
  },
  filterGroup: {
    marginBottom: Spacing.sm,
  },
  filterGroupLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: Colors.textMutedLight,
    marginBottom: 4,
  },
  pillRow: {
    flexDirection: 'row',
  },
  chip: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: Radius.md,
    marginRight: Spacing.xs,
  },
  chipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '500',
    color: Colors.textSecondaryLight,
  },
  chipTextActive: {
    color: Colors.surfaceLight,
    fontWeight: '600',
  },
  dualFilterRow: {
    gap: Spacing.sm,
  },
  dualFilterRowDesktop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
  },
  inlineFilter: {
    flexDirection: 'column',
  },
  rowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  smallChip: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    backgroundColor: Colors.subtleLight,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: Radius.sm,
  },
  smallChipActive: {
    backgroundColor: Colors.accentCyan,
    borderColor: Colors.accentCyan,
  },
  smallChipText: {
    fontSize: 11,
    fontWeight: '500',
    color: Colors.textSecondaryLight,
  },
  smallChipTextActive: {
    color: Colors.brandDeep,
    fontWeight: '600',
  },
  cardHeaderStrip: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
    marginBottom: Spacing.md,
  },
  metaTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimaryLight,
  },
  metaSub: {
    fontSize: 11,
    color: Colors.textMutedLight,
    marginTop: 2,
  },
  badgePill: {
    backgroundColor: Colors.subtleLight,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.borderLight,
  },
  badgePillText: {
    fontSize: 11,
    color: Colors.textMutedLight,
    fontWeight: '500',
  },
  matrixScroll: {
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  matrixTable: {
    minWidth: 860,
  },
  matrixHeaderRow: {
    flexDirection: 'row',
    backgroundColor: Colors.brandDeep,
  },
  matrixHeaderCell: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRightWidth: 1,
    borderRightColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  matrixTimeCol: {
    flex: 0.8,
    backgroundColor: 'rgba(0, 49, 53, 0.95)',
  },
  matrixHeaderText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  matrixBreakRow: {
    backgroundColor: Colors.subtleLight,
    paddingVertical: 6,
    alignItems: 'center',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.borderLight,
  },
  matrixBreakText: {
    fontSize: 11,
    fontWeight: '500',
    color: Colors.textMutedLight,
    fontStyle: 'italic',
  },
  matrixRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  matrixCell: {
    flex: 1,
    padding: 6,
    borderRightWidth: 1,
    borderRightColor: Colors.borderLight,
    backgroundColor: Colors.surfaceLight,
    minHeight: 80,
    justifyContent: 'center',
  },
  matrixCellEmpty: {
    backgroundColor: Colors.subtleLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  matrixCellLab: {
    backgroundColor: 'rgba(150, 71, 52, 0.05)',
    borderLeftWidth: 2,
    borderLeftColor: Colors.accentTerracotta,
  },
  matrixPeriodIndex: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textPrimaryLight,
    fontFamily: Typography.codeFont,
    textAlign: 'center',
  },
  matrixPeriodTime: {
    fontSize: 10,
    color: Colors.textMutedLight,
    textAlign: 'center',
    marginTop: 2,
    fontFamily: Typography.codeFont,
  },
  matrixSlotContent: {
    gap: 2,
  },
  matrixSubjectCode: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.primary,
    fontFamily: Typography.codeFont,
  },
  codeLab: {
    color: Colors.accentTerracotta,
  },
  matrixSubjectName: {
    fontSize: 11,
    fontWeight: '500',
    color: Colors.textPrimaryLight,
    lineHeight: 14,
  },
  matrixMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  matrixVenue: {
    fontSize: 10,
    color: Colors.textMutedLight,
    fontFamily: Typography.codeFont,
  },
  matrixFaculty: {
    fontSize: 10,
    color: Colors.textSecondaryLight,
  },
  labBadgeMini: {
    backgroundColor: 'rgba(150, 71, 52, 0.15)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: Radius.sm,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  labBadgeMiniText: {
    fontSize: 9,
    color: Colors.accentTerracotta,
    fontWeight: '600',
  },
  matrixEmptyText: {
    fontSize: 11,
    color: Colors.textMutedLight,
  },
  dayNavRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  dayChip: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: Radius.sm,
  },
  dayChipActive: {
    backgroundColor: Colors.brandDeep,
    borderColor: Colors.brandDeep,
  },
  dayChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: Colors.textSecondaryLight,
  },
  dayChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  slotsList: {
    gap: Spacing.sm,
  },
  slotCard: {
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: Radius.lg,
    padding: Spacing.md,
  },
  slotCardLab: {
    borderColor: Colors.accentTerracotta,
    backgroundColor: '#FCFAF9',
  },
  slotHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xs,
  },
  periodBadge: {
    backgroundColor: Colors.subtleLight,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.sm,
    marginRight: Spacing.sm,
  },
  periodIndexText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textPrimaryLight,
    fontFamily: Typography.codeFont,
  },
  slotTimeText: {
    fontSize: 12,
    color: Colors.textMutedLight,
    flex: 1,
    fontFamily: Typography.codeFont,
  },
  venuePill: {
    backgroundColor: Colors.subtleLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
  venuePillLab: {
    backgroundColor: 'rgba(150, 71, 52, 0.1)',
  },
  venuePillText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textPrimaryLight,
    fontFamily: Typography.codeFont,
  },
  venuePillTextLab: {
    color: Colors.accentTerracotta,
  },
  slotBody: {
    marginTop: Spacing.xs,
  },
  subjectCode: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.primary,
    fontFamily: Typography.codeFont,
  },
  subjectName: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.textPrimaryLight,
    marginTop: 2,
  },
  facultyName: {
    fontSize: 12,
    color: Colors.textSecondaryLight,
    marginTop: 4,
  },
  facultyHighlight: {
    fontWeight: '600',
    color: Colors.textPrimaryLight,
  },
  substituteBox: {
    marginTop: Spacing.sm,
    padding: Spacing.xs,
    backgroundColor: Colors.warningBg,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(217, 119, 6, 0.3)',
  },
  substituteText: {
    fontSize: 11,
    color: Colors.warning,
    fontWeight: '500',
  },
  labTagRow: {
    marginTop: Spacing.xs,
  },
  labTagText: {
    fontSize: 11,
    color: Colors.accentTerracotta,
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
  emptySubtitle: {
    fontSize: 12,
    color: Colors.textMutedLight,
    marginTop: 4,
    textAlign: 'center',
  },
});
