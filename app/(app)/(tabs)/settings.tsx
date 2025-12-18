import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, Switch, Linking, Platform, Modal, Share, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/auth';
import { supabase } from '@/lib/supabase';
import * as Notifications from 'expo-notifications';
import * as Application from 'expo-application';
import useI18n from '@/hooks/useI18n';
import { shareInvite, acceptInvite } from '@/lib/familyInvite';

export default function SettingsScreen() {
    const router = useRouter();
    const { user, signOut } = useAuth();
    const { t, locale, changeLanguage, languages } = useI18n();
    const [notificationsEnabled, setNotificationsEnabled] = useState(false);
    const [showLanguageModal, setShowLanguageModal] = useState(false);
    const [showJoinModal, setShowJoinModal] = useState(false);
    const [inviteCode, setInviteCode] = useState('');
    const [isJoining, setIsJoining] = useState(false);

    useEffect(() => {
        checkNotificationStatus();
    }, []);

    const checkNotificationStatus = async () => {
        const { status } = await Notifications.getPermissionsAsync();
        setNotificationsEnabled(status === 'granted');
    };

    const handleNotificationToggle = async (value: boolean) => {
        if (value) {
            const { status } = await Notifications.requestPermissionsAsync();
            if (status === 'granted') {
                setNotificationsEnabled(true);
            } else {
                Alert.alert(
                    t('settings.notificationsDisabledTitle'),
                    t('settings.notificationsDisabledMessage'),
                    [
                        { text: t('common.cancel'), style: 'cancel' },
                        {
                            text: t('settings.openSettings'),
                            onPress: () => Linking.openSettings()
                        },
                    ]
                );
            }
        } else {
            Alert.alert(
                t('settings.disableNotifications'),
                t('settings.disableNotificationsMessage'),
                [
                    { text: t('common.cancel'), style: 'cancel' },
                    {
                        text: t('settings.openSettings'),
                        onPress: () => Linking.openSettings()
                    },
                ]
            );
        }
    };

    const handleLogout = async () => {
        Alert.alert(
            t('settings.logout'),
            t('settings.logoutConfirm'),
            [
                { text: t('common.cancel'), style: 'cancel' },
                {
                    text: t('settings.logout'),
                    style: 'destructive',
                    onPress: async () => {
                        await signOut();
                    },
                },
            ]
        );
    };

    const handleDeleteAccount = () => {
        Alert.alert(
            t('settings.deleteAccount'),
            t('settings.deleteAccountConfirm'),
            [
                { text: t('common.cancel'), style: 'cancel' },
                {
                    text: t('settings.deleteAccount'),
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            // Call edge function to delete all user data
                            const { error } = await supabase.functions.invoke('delete-user-data');
                            if (error) throw error;
                            await signOut();
                        } catch (error) {
                            console.error('Error deleting account:', error);
                            Alert.alert(t('common.error'), t('errors.accountDeleteFailed'));
                        }
                    },
                },
            ]
        );
    };

    const handleInviteFamily = async () => {
        if (!user) return;
        await shareInvite(user.id);
    };

    const handleJoinFamilySubmit = async () => {
        if (!user || !inviteCode.trim()) return;

        setIsJoining(true);
        const success = await acceptInvite(user.id, inviteCode.trim());
        setIsJoining(false);

        if (success) {
            setShowJoinModal(false);
            setInviteCode('');
        }
    };

    const SettingsItem = ({
        icon,
        title,
        subtitle,
        onPress,
        danger = false,
    }: {
        icon: string;
        title: string;
        subtitle?: string;
        onPress: () => void;
        danger?: boolean;
    }) => (
        <TouchableOpacity style={styles.item} onPress={onPress}>
            <View style={[styles.iconContainer, danger && styles.iconDanger]}>
                <Ionicons
                    name={icon as any}
                    size={22}
                    color={danger ? '#EF4444' : '#A78BFA'}
                />
            </View>
            <View style={styles.itemContent}>
                <Text style={[styles.itemTitle, danger && styles.textDanger]}>
                    {title}
                </Text>
                {subtitle && <Text style={styles.itemSubtitle}>{subtitle}</Text>}
            </View>
            <Ionicons name="chevron-forward" size={20} color="#6B5B8A" />
        </TouchableOpacity>
    );

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            {/* User Info */}
            <View style={styles.userCard}>
                <View style={styles.userAvatar}>
                    <Ionicons name="person" size={32} color="#A78BFA" />
                </View>
                <View style={styles.userInfo}>
                    <Text style={styles.userEmail}>{user?.email}</Text>
                    <Text style={styles.userMeta}>
                        {t('settings.memberSince')} {new Date(user?.created_at || '').toLocaleDateString(locale === 'de' ? 'de-DE' : locale === 'fr' ? 'fr-FR' : locale === 'it' ? 'it-IT' : 'en-GB', {
                            month: 'long',
                            year: 'numeric',
                        })}
                    </Text>
                </View>
            </View>

            {/* Children Section */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('settings.children')}</Text>
                <SettingsItem
                    icon="people"
                    title={t('settings.manageChildren')}
                    subtitle={t('settings.manageChildrenHint')}
                    onPress={() => router.push('/(app)/children/')}
                />
            </View>

            {/* Family Section */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('settings.family')}</Text>
                <SettingsItem
                    icon="person-add"
                    title={t('settings.inviteFamily')}
                    subtitle={t('settings.inviteFamilyHint')}
                    onPress={handleInviteFamily}
                />
                <SettingsItem
                    icon="enter"
                    title={t('settings.joinFamily') || 'Familie beitreten'}
                    subtitle={t('settings.joinFamilyHint') || 'Einladungscode eingeben'}
                    onPress={() => setShowJoinModal(true)}
                />
            </View>

            {/* Subscription Section */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('settings.subscription') || 'Abo'}</Text>
                <SettingsItem
                    icon="diamond"
                    title={t('settings.manageSubscription') || 'Abo verwalten'}
                    subtitle={t('settings.subscriptionHint') || 'Coins kaufen oder Premium abonnieren'}
                    onPress={() => router.push('/(app)/subscription')}
                />
            </View>

            {/* App Section */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('settings.app')}</Text>
                <View style={styles.item}>
                    <View style={styles.iconContainer}>
                        <Ionicons name="notifications" size={22} color="#A78BFA" />
                    </View>
                    <View style={styles.itemContent}>
                        <Text style={styles.itemTitle}>{t('settings.notifications')}</Text>
                        <Text style={styles.itemSubtitle}>
                            {notificationsEnabled ? t('settings.notificationsEnabled') : t('settings.notificationsDisabled')}
                        </Text>
                    </View>
                    <Switch
                        value={notificationsEnabled}
                        onValueChange={handleNotificationToggle}
                        trackColor={{ false: '#3D3255', true: '#7C3AED' }}
                        thumbColor={notificationsEnabled ? '#A78BFA' : '#6B5B8A'}
                    />
                </View>
                <SettingsItem
                    icon="language"
                    title={t('settings.language')}
                    subtitle={languages.find(l => l.code === locale)?.name || 'Deutsch'}
                    onPress={() => setShowLanguageModal(true)}
                />
            </View>

            {/* Language Selection Modal */}
            <Modal
                visible={showLanguageModal}
                transparent
                animationType="fade"
                onRequestClose={() => setShowLanguageModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>{t('settings.selectLanguage')}</Text>
                        {languages.map((lang) => (
                            <TouchableOpacity
                                key={lang.code}
                                style={[
                                    styles.languageOption,
                                    locale === lang.code && styles.languageOptionSelected
                                ]}
                                onPress={() => {
                                    changeLanguage(lang.code as 'de' | 'en' | 'fr' | 'it');
                                    setShowLanguageModal(false);
                                }}
                            >
                                <Text style={styles.languageFlag}>{lang.flag}</Text>
                                <Text style={[
                                    styles.languageName,
                                    locale === lang.code && styles.languageNameSelected
                                ]}>{lang.name}</Text>
                                {locale === lang.code && (
                                    <Ionicons name="checkmark" size={20} color="#7C3AED" />
                                )}
                            </TouchableOpacity>
                        ))}
                        <TouchableOpacity
                            style={styles.modalCloseButton}
                            onPress={() => setShowLanguageModal(false)}
                        >
                            <Text style={styles.modalCloseText}>{t('common.close')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Join Family Modal */}
            <Modal
                visible={showJoinModal}
                transparent
                animationType="fade"
                onRequestClose={() => setShowJoinModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>{t('settings.enterInviteCode') || 'Code eingeben'}</Text>
                        <TextInput
                            style={styles.input}
                            value={inviteCode}
                            onChangeText={setInviteCode}
                            placeholder="TF-XXXXXX"
                            placeholderTextColor="#6B5B8A"
                            autoCapitalize="characters"
                            autoCorrect={false}
                        />
                        <TouchableOpacity
                            style={styles.primaryButton}
                            onPress={handleJoinFamilySubmit}
                            disabled={isJoining}
                        >
                            <Text style={styles.primaryButtonText}>
                                {isJoining ? (t('common.loading') || 'Lädt...') : (t('settings.joinFamily') || 'Beitreten')}
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.modalCloseButton}
                            onPress={() => setShowJoinModal(false)}
                        >
                            <Text style={styles.modalCloseText}>{t('common.cancel')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Legal Section */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('settings.legal')}</Text>
                <SettingsItem
                    icon="document-text"
                    title={t('settings.privacy')}
                    onPress={() => router.push({ pathname: '/(app)/webview', params: { url: 'https://gross-ict.ch/privacy', title: t('settings.privacy') } })}
                />
                <SettingsItem
                    icon="document"
                    title={t('settings.terms')}
                    onPress={() => router.push({ pathname: '/(app)/webview', params: { url: 'https://gross-ict.ch/imprint', title: t('settings.terms') } })}
                />
                <SettingsItem
                    icon="information-circle"
                    title={t('settings.imprint')}
                    onPress={() => router.push({ pathname: '/(app)/webview', params: { url: 'https://gross-ict.ch/imprint', title: t('settings.imprint') } })}
                />
            </View>

            {/* Account Section */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>{t('settings.account')}</Text>
                <SettingsItem
                    icon="log-out"
                    title={t('settings.logout')}
                    onPress={handleLogout}
                />
                <SettingsItem
                    icon="trash"
                    title={t('settings.deleteAccount')}
                    subtitle={t('settings.deleteAccountMessage')}
                    onPress={handleDeleteAccount}
                    danger
                />
            </View>

            {/* Version */}
            <Text style={styles.version}>
                {t('settings.version')} {Application.nativeApplicationVersion} (Build {Application.nativeBuildVersion})
            </Text>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#1A1625',
    },
    content: {
        padding: 16,
        paddingBottom: 40,
    },
    userCard: {
        backgroundColor: '#2D2640',
        borderRadius: 16,
        padding: 20,
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 24,
        borderWidth: 1,
        borderColor: '#4C4270',
    },
    userAvatar: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: '#3D3255',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    userInfo: {
        flex: 1,
    },
    userEmail: {
        fontSize: 16,
        fontWeight: '600',
        color: '#F5F3FF',
        marginBottom: 4,
    },
    userMeta: {
        fontSize: 13,
        color: '#8B7FA8',
    },
    section: {
        marginBottom: 24,
    },
    sectionTitle: {
        fontSize: 13,
        fontWeight: '600',
        color: '#6B5B8A',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 8,
        marginLeft: 4,
    },
    item: {
        backgroundColor: '#2D2640',
        borderRadius: 12,
        padding: 14,
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
        borderWidth: 1,
        borderColor: '#3D3255',
    },
    iconContainer: {
        width: 40,
        height: 40,
        borderRadius: 10,
        backgroundColor: '#3D3255',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    iconDanger: {
        backgroundColor: 'rgba(239, 68, 68, 0.15)',
    },
    itemContent: {
        flex: 1,
    },
    itemTitle: {
        fontSize: 15,
        fontWeight: '500',
        color: '#F5F3FF',
    },
    itemSubtitle: {
        fontSize: 12,
        color: '#8B7FA8',
        marginTop: 2,
    },
    textDanger: {
        color: '#EF4444',
    },
    version: {
        textAlign: 'center',
        color: '#6B5B8A',
        fontSize: 12,
        marginTop: 16,
    },
    // Language Modal Styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    modalContent: {
        backgroundColor: '#2D2640',
        borderRadius: 16,
        padding: 20,
        width: '100%',
        maxWidth: 320,
        borderWidth: 1,
        borderColor: '#3D3255',
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#F5F3FF',
        textAlign: 'center',
        marginBottom: 16,
    },
    languageOption: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 14,
        borderRadius: 10,
        marginBottom: 8,
        backgroundColor: '#1A1625',
        borderWidth: 1,
        borderColor: '#3D3255',
    },
    languageOptionSelected: {
        borderColor: '#7C3AED',
        backgroundColor: 'rgba(124, 58, 237, 0.15)',
    },
    languageFlag: {
        fontSize: 24,
        marginRight: 12,
    },
    languageName: {
        flex: 1,
        fontSize: 16,
        color: '#F5F3FF',
    },
    languageNameSelected: {
        color: '#A78BFA',
        fontWeight: '600',
    },
    modalCloseButton: {
        marginTop: 8,
        padding: 12,
        alignItems: 'center',
    },
    modalCloseText: {
        color: '#8B7FA8',
        fontSize: 14,
    },
    input: {
        backgroundColor: '#1A1625',
        borderWidth: 1,
        borderColor: '#3D3255',
        borderRadius: 10,
        padding: 14,
        color: '#F5F3FF',
        fontSize: 16,
        marginBottom: 16,
        textAlign: 'center',
        fontWeight: 'bold',
        letterSpacing: 2,
    },
    primaryButton: {
        backgroundColor: '#7C3AED',
        borderRadius: 10,
        padding: 14,
        alignItems: 'center',
    },
    primaryButtonText: {
        color: '#F5F3FF',
        fontSize: 16,
        fontWeight: '600',
    },
});
