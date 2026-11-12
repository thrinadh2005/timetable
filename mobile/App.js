import React, { useState, useEffect } from 'react';
import {
  SafeAreaView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Platform,
  useWindowDimensions,
  ScrollView,
} from 'react-native';
import { Colors, Spacing, Radius } from './src/theme';
import { ApiService } from './src/services/api';
import TimetableScreen from './src/screens/TimetableScreen';
import LaboratoriesScreen from './src/screens/LaboratoriesScreen';
import AvailabilityScreen from './src/screens/AvailabilityScreen';
import ApprovalsScreen from './src/screens/ApprovalsScreen';
import ProfileScreen from './src/screens/ProfileScreen';

export default function App() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 860;

  const [activeTab, setActiveTab] = useState('SCHEDULE'); // 'SCHEDULE' | 'LABS' | 'ROOMS' | 'APPROVALS' | 'PROFILE'
  const [currentUser, setCurrentUser] = useState(null);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    async function setup() {
      await ApiService.init();
      if (ApiService.user) {
        setCurrentUser(ApiService.user);
      }
      checkPendingApprovals(ApiService.user);
    }
    setup();
  }, []);

  // Approval duties (laboratory bookings + faculty substitutions) are reserved
  // for the HOD, the Executive School Dean, and the Super Admin — mirroring the
  // RBAC matrix and the requireRole guards on the backing endpoints.
  const canApprove = ['SUPER_ADMIN', 'DEAN', 'DEPT_ADMIN'].includes(currentUser?.role);

  async function checkPendingApprovals(user = currentUser) {
    if (!['SUPER_ADMIN', 'DEAN', 'DEPT_ADMIN'].includes(user?.role)) {
      setPendingCount(0);
      return;
    }
    try {
      const [labs, subs] = await Promise.all([
        ApiService.getPendingLabRequests().catch(() => []),
        ApiService.getPendingSubstitutions().catch(() => []),
      ]);
      setPendingCount((labs?.length || 0) + (subs?.length || 0));
    } catch (e) {
      // quiet catch
    }
  }

  const navItems = [
    { id: 'SCHEDULE', label: 'Schedule & Matrix' },
    { id: 'LABS', label: 'Laboratory Facilities' },
    { id: 'ROOMS', label: 'Spatial Availability' },
    ...(canApprove ? [{ id: 'APPROVALS', label: 'Approvals Queue', badge: pendingCount }] : []),
    { id: 'SETTINGS', label: 'Settings & Profile' },
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.brandDeep} />

      {/* Institutional Top Header */}
      <View style={styles.header}>
        <View style={styles.headerInner}>
          <View style={styles.brandRow}>
            <View style={styles.brandIconBox}>
              <Text style={styles.brandIconText}>GMR</Text>
            </View>
            <View style={styles.brandTitles}>
              <Text style={styles.brandTitle}>GMRITDU Timetable Management System</Text>
              <Text style={styles.brandSub}>
                Centralized Class, Laboratory &amp; Faculty Schedule Architecture
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {/* User Identity Card / Login Trigger */}
            <TouchableOpacity
              style={styles.headerUserPill}
              onPress={() => setActiveTab('SETTINGS')}
            >
              <View style={styles.userDot} />
              <Text style={styles.headerUserText}>
                {currentUser ? currentUser.fullName : 'Sign In'}
              </Text>
              {currentUser ? (
                <View style={styles.userRoleTag}>
                  <Text style={styles.userRoleTagText}>{currentUser.role}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Main Workspace Body: Desktop (Sidebar + Fluid Content) vs Mobile (Full Content) */}
      <View style={[styles.mainShell, isDesktop ? styles.desktopShell : styles.mobileShell]}>
        {/* Desktop Sidebar (Only rendered on wider screens) */}
        {isDesktop && (
          <View style={styles.desktopSidebar}>
            {/* User Profile Card */}
            <TouchableOpacity
              style={styles.sidebarUserCard}
              onPress={() => setActiveTab('PROFILE')}
            >
              <View style={styles.sidebarAvatar}>
                <Text style={styles.sidebarAvatarText}>
                  {currentUser?.fullName
                    ? currentUser.fullName
                        .split(' ')
                        .map((n) => n[0])
                        .slice(0, 2)
                        .join('')
                    : 'GM'}
                </Text>
              </View>
              <View style={styles.sidebarUserMeta}>
                <Text style={styles.sidebarUserName} numberOfLines={1}>
                  {currentUser?.fullName || 'Guest User'}
                </Text>
                <Text style={styles.sidebarUserRole} numberOfLines={1}>
                  {currentUser?.role || 'Sign in to access'}
                </Text>
              </View>
            </TouchableOpacity>

            <Text style={styles.sidebarGroupTitle}>Academic Navigation</Text>

            {/* Vertical Navigation Items */}
            <View style={styles.sidebarNavList}>
              {navItems.map((item) => {
                const active = activeTab === item.id;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.sidebarNavItem, active && styles.sidebarNavItemActive]}
                    onPress={() => setActiveTab(item.id)}
                  >
                    <View style={[styles.sidebarBullet, active && styles.sidebarBulletActive]} />
                    <Text
                      style={[
                        styles.sidebarNavText,
                        active && styles.sidebarNavTextActive,
                      ]}
                    >
                      {item.label}
                    </Text>
                    {item.badge > 0 ? (
                      <View style={styles.sidebarBadge}>
                        <Text style={styles.sidebarBadgeText}>{item.badge}</Text>
                      </View>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.sidebarFooter}>
              <Text style={styles.sidebarFooterText}>
                Autonomous Session 2026-2027 &bull; v1.0 Production
              </Text>
            </View>
          </View>
        )}

        {/* View Content Container */}
        <View style={styles.viewport}>
          {activeTab === 'SCHEDULE' && (
            <TimetableScreen currentUser={currentUser} isDesktop={isDesktop} />
          )}
          {activeTab === 'LABS' && (
            <LaboratoriesScreen currentUser={currentUser} isDesktop={isDesktop} />
          )}
          {activeTab === 'ROOMS' && (
            <AvailabilityScreen currentUser={currentUser} isDesktop={isDesktop} />
          )}
          {activeTab === 'APPROVALS' && canApprove && (
            <ApprovalsScreen currentUser={currentUser} isDesktop={isDesktop} />
          )}
          {activeTab === 'SETTINGS' && (
            <ProfileScreen
              currentUser={currentUser}
              isDesktop={isDesktop}
              onUserChange={(user) => {
                setCurrentUser(user);
                checkPendingApprovals(user);
              }}
            />
          )}
        </View>
      </View>

      {/* Mobile Bottom Navigation Bar (Hidden on Desktop) */}
      {!isDesktop && (
        <View style={styles.mobileNavBar}>
          <TouchableOpacity
            style={[styles.mobileNavTab, activeTab === 'SCHEDULE' && styles.mobileNavTabActive]}
            onPress={() => setActiveTab('SCHEDULE')}
          >
            <Text
              style={[
                styles.mobileNavText,
                activeTab === 'SCHEDULE' && styles.mobileNavTextActive,
              ]}
            >
              Schedule
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.mobileNavTab, activeTab === 'LABS' && styles.mobileNavTabActive]}
            onPress={() => setActiveTab('LABS')}
          >
            <Text
              style={[
                styles.mobileNavText,
                activeTab === 'LABS' && styles.mobileNavTextActive,
              ]}
            >
              Labs
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.mobileNavTab, activeTab === 'ROOMS' && styles.mobileNavTabActive]}
            onPress={() => setActiveTab('ROOMS')}
          >
            <Text
              style={[
                styles.mobileNavText,
                activeTab === 'ROOMS' && styles.mobileNavTextActive,
              ]}
            >
              Rooms
            </Text>
          </TouchableOpacity>

          {canApprove && (
            <TouchableOpacity
              style={[
                styles.mobileNavTab,
                activeTab === 'APPROVALS' && styles.mobileNavTabActive,
              ]}
              onPress={() => setActiveTab('APPROVALS')}
            >
              <View style={styles.tabBadgeRow}>
                <Text
                  style={[
                    styles.mobileNavText,
                    activeTab === 'APPROVALS' && styles.mobileNavTextActive,
                  ]}
                >
                  Approvals
                </Text>
                {pendingCount > 0 ? (
                  <View style={styles.badgeCount}>
                    <Text style={styles.badgeCountText}>{pendingCount}</Text>
                  </View>
                ) : null}
              </View>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.mobileNavTab, activeTab === 'SETTINGS' && styles.mobileNavTabActive]}
            onPress={() => setActiveTab('SETTINGS')}
          >
            <Text
              style={[
                styles.mobileNavText,
                activeTab === 'SETTINGS' && styles.mobileNavTextActive,
              ]}
            >
              Settings
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.brandDeep,
  },
  header: {
    backgroundColor: Colors.brandDeep,
    borderBottomWidth: 1,
    borderBottomColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  headerInner: {
    maxWidth: 1600,
    width: '100%',
    alignSelf: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  brandIconBox: {
    width: 36,
    height: 36,
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandIconText: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.brandDeep,
  },
  brandTitles: {},
  brandTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  brandSub: {
    fontSize: 11,
    color: Colors.mintIce,
    marginTop: 2,
  },
  headerUserPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(175, 221, 229, 0.25)',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: Radius.md,
    gap: 6,
  },
  portalToggleBtn: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(175, 221, 229, 0.35)',
  },
  portalToggleText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  userDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.accentCyan,
  },
  headerUserText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  userRoleTag: {
    backgroundColor: Colors.accentCyan,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: Radius.sm,
  },
  userRoleTagText: {
    fontSize: 9,
    fontWeight: '700',
    color: Colors.brandDeep,
  },
  mainShell: {
    flex: 1,
    backgroundColor: Colors.bgLight,
  },
  desktopShell: {
    flexDirection: 'row',
    maxWidth: 1600,
    width: '100%',
    alignSelf: 'center',
  },
  mobileShell: {
    flexDirection: 'column',
  },
  desktopSidebar: {
    width: 240,
    backgroundColor: Colors.surfaceLight,
    borderRightWidth: 1,
    borderRightColor: Colors.borderLight,
    padding: Spacing.md,
    display: 'flex',
    flexDirection: 'column',
  },
  sidebarUserCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: Spacing.sm,
    backgroundColor: Colors.subtleLight,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: Radius.md,
    marginBottom: Spacing.lg,
  },
  sidebarAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sidebarAvatarText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  sidebarUserMeta: {
    flex: 1,
  },
  sidebarUserName: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimaryLight,
  },
  sidebarUserRole: {
    fontSize: 11,
    color: Colors.textMutedLight,
    marginTop: 1,
  },
  sidebarGroupTitle: {
    fontSize: 11,
    fontWeight: '500',
    color: Colors.textMutedLight,
    marginBottom: Spacing.xs,
    paddingHorizontal: Spacing.xs,
  },
  sidebarNavList: {
    gap: 2,
    flex: 1,
  },
  sidebarNavItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: Radius.md,
    gap: 10,
  },
  sidebarNavItemActive: {
    backgroundColor: Colors.subtleLight,
  },
  sidebarBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.borderStrongLight,
  },
  sidebarBulletActive: {
    backgroundColor: Colors.accentCyan,
  },
  sidebarNavText: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.textSecondaryLight,
    flex: 1,
  },
  sidebarNavTextActive: {
    fontWeight: '600',
    color: Colors.primary,
  },
  sidebarBadge: {
    backgroundColor: Colors.accentTerracotta,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  sidebarBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  sidebarFooter: {
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  sidebarFooterText: {
    fontSize: 10,
    color: Colors.textMutedLight,
    lineHeight: 14,
  },
  viewport: {
    flex: 1,
    minWidth: 0,
    backgroundColor: Colors.bgLight,
  },
  mobileNavBar: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceLight,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    paddingHorizontal: Spacing.sm,
  },
  mobileNavTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: Radius.md,
  },
  mobileNavTabActive: {
    backgroundColor: Colors.subtleLight,
  },
  mobileNavText: {
    fontSize: 12,
    fontWeight: '500',
    color: Colors.textSecondaryLight,
  },
  mobileNavTextActive: {
    fontWeight: '600',
    color: Colors.primary,
  },
  tabBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  badgeCount: {
    backgroundColor: Colors.accentTerracotta,
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  badgeCountText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
  },
});
