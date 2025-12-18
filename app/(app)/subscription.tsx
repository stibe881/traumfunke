import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    Alert,
    ActivityIndicator,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
    getOfferings,
    purchasePackage,
    checkPremiumStatus,
    restorePurchases,
    getCoinBalance,
    addCoins,
    PRODUCT_IDS,
} from '@/lib/purchases';
import useI18n from '@/hooks/useI18n';

export default function SubscriptionScreen() {
    const router = useRouter();
    const { t } = useI18n();
    const [isLoading, setIsLoading] = useState(true);
    const [isPurchasing, setIsPurchasing] = useState(false);
    const [isPremium, setIsPremium] = useState(false);
    const [coinBalance, setCoinBalance] = useState(0);
    const [expiresAt, setExpiresAt] = useState<string | null>(null);
    const [offerings, setOfferings] = useState<any>(null);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setIsLoading(true);
        const [premium, balance, offers] = await Promise.all([
            checkPremiumStatus(),
            getCoinBalance(),
            getOfferings(),
        ]);
        setIsPremium(premium);
        setIsPremium(premium);
        setCoinBalance(balance.coins);
        setExpiresAt(balance.expiresAt);
        setOfferings(offers);
        setIsLoading(false);
    };

    const handlePurchase = async (pkg: any) => {
        setIsPurchasing(true);
        const result = await purchasePackage(pkg);
        setIsPurchasing(false);

        if (result) {
            // Check if it was a coin purchase
            if (pkg.product.identifier === PRODUCT_IDS.COINS_5) {
                await addCoins(5, '5 Münzen gekauft');
            } else if (pkg.product.identifier === PRODUCT_IDS.COINS_1) {
                await addCoins(1, '1 Münze gekauft');
            }
            await loadData();
            Alert.alert(t('common.success'), t('subscription.purchaseSuccess'));
        }
    };

    const handleRestore = async () => {
        setIsPurchasing(true);
        const result = await restorePurchases();
        setIsPurchasing(false);

        if (result) {
            await loadData();
            Alert.alert(t('common.success'), t('subscription.restoreSuccess'));
        } else {
            Alert.alert('Info', t('subscription.noRestores'));
        }
    };

    if (isLoading) {
        return (
            <SafeAreaView style={styles.container}>
                <Stack.Screen options={{ title: t('subscription.title') }} />
                <View style={styles.centered}>
                    <ActivityIndicator size="large" color="#7C3AED" />
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container} edges={['bottom']}>
            <Stack.Screen
                options={{
                    title: t('subscription.title'),
                    headerStyle: { backgroundColor: '#1A1625' },
                    headerTintColor: '#F5F3FF',
                }}
            />
            <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
                {/* Current Status */}
                <View style={styles.statusCard}>
                    {isPremium ? (
                        <>
                            <View style={styles.premiumBadge}>
                                <Ionicons name="star" size={24} color="#FFD700" />
                                <Text style={styles.premiumTitle}>{t('subscription.premiumActive')}</Text>
                            </View>
                            <Text style={styles.statusText}>
                                {t('subscription.unlimitedAccess')}
                            </Text>
                            {expiresAt && (
                                <Text style={styles.expiryText}>
                                    {(t('subscription.expiresAt') || 'Läuft ab am')}: {new Date(expiresAt).toLocaleDateString()}
                                </Text>
                            )}
                        </>
                    ) : (
                        <>
                            <View style={styles.coinDisplay}>
                                <Text style={styles.coinEmoji}>🪙</Text>
                                <Text style={styles.coinAmount}>{coinBalance}</Text>
                                <Text style={styles.coinLabel}>{t('subscription.coins')}</Text>
                            </View>
                            <Text style={styles.statusText}>
                                {t('subscription.coinExchange')}
                            </Text>
                        </>
                    )}
                </View>

                {!isPremium && (
                    <>
                        {/* Premium Section */}
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>{t('subscription.becomePremium')}</Text>
                            <Text style={styles.sectionSubtitle}>
                                {t('subscription.unlimitedStories')}
                            </Text>

                            <TouchableOpacity
                                style={[styles.packageCard, styles.yearlyCard]}
                                onPress={() => {
                                    const pkg = offerings?.availablePackages?.find(
                                        (p: any) => p.product.identifier === PRODUCT_IDS.PREMIUM_YEARLY
                                    );
                                    if (pkg) handlePurchase(pkg);
                                }}
                                disabled={isPurchasing}
                            >
                                <View style={styles.bestValue}>
                                    <Text style={styles.bestValueText}>{t('subscription.bestValue')}</Text>
                                </View>
                                <Text style={styles.packageTitle}>{t('subscription.yearlyPlan')}</Text>
                                <Text style={styles.packagePrice}>{t('subscription.yearlyPrice')}</Text>
                                <Text style={styles.packageInfo}>{t('subscription.yearlyInfo')}</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.packageCard}
                                onPress={() => {
                                    const pkg = offerings?.availablePackages?.find(
                                        (p: any) => p.product.identifier === PRODUCT_IDS.PREMIUM_MONTHLY
                                    );
                                    if (pkg) handlePurchase(pkg);
                                }}
                                disabled={isPurchasing}
                            >
                                <Text style={styles.packageTitle}>{t('subscription.monthlyPlan')}</Text>
                                <Text style={styles.packagePrice}>{t('subscription.monthlyPrice')}</Text>
                                <Text style={styles.packageInfo}>{t('subscription.monthlyInfo')}</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Coins Section */}
                        <View style={styles.section}>
                            <Text style={styles.sectionTitle}>{t('subscription.buyCoins')}</Text>
                            <Text style={styles.sectionSubtitle}>
                                {t('subscription.payAsYouGo')}
                            </Text>

                            <TouchableOpacity
                                style={styles.packageCard}
                                onPress={() => {
                                    const pkg = offerings?.availablePackages?.find(
                                        (p: any) => p.product.identifier === PRODUCT_IDS.COINS_5
                                    );
                                    if (pkg) handlePurchase(pkg);
                                }}
                                disabled={isPurchasing}
                            >
                                <View style={styles.coinPackage}>
                                    <Text style={styles.coinPackageEmoji}>🪙🪙🪙🪙🪙</Text>
                                    <View>
                                        <Text style={styles.packageTitle}>{t('subscription.fiveCoins')}</Text>
                                        <Text style={styles.packagePrice}>{t('subscription.fiveCoinsPrice')}</Text>
                                    </View>
                                </View>
                            </TouchableOpacity>
                        </View>
                    </>
                )}

                {/* Restore Purchases */}
                <TouchableOpacity
                    style={styles.restoreButton}
                    onPress={handleRestore}
                    disabled={isPurchasing}
                >
                    <Text style={styles.restoreText}>{t('subscription.restorePurchases')}</Text>
                </TouchableOpacity>

                {isPurchasing && (
                    <View style={styles.loadingOverlay}>
                        <ActivityIndicator size="large" color="#7C3AED" />
                        <Text style={styles.loadingText}>{t('subscription.processing')}</Text>
                    </View>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#1A1625',
    },
    centered: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    scrollView: {
        flex: 1,
    },
    content: {
        padding: 20,
        paddingTop: 100,
        paddingBottom: 40,
    },
    statusCard: {
        backgroundColor: '#2D2640',
        borderRadius: 16,
        padding: 24,
        alignItems: 'center',
        marginBottom: 24,
    },
    premiumBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
    },
    premiumTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#FFD700',
    },
    coinDisplay: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
    },
    coinEmoji: {
        fontSize: 32,
    },
    coinAmount: {
        fontSize: 36,
        fontWeight: 'bold',
        color: '#FFD700',
    },
    coinLabel: {
        fontSize: 18,
        color: '#8B7FA8',
    },
    statusText: {
        fontSize: 14,
        color: '#8B7FA8',
        textAlign: 'center',
    },
    expiryText: {
        fontSize: 12,
        color: '#A78BFA',
        marginTop: 8,
        textAlign: 'center',
    },
    section: {
        marginBottom: 24,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#F5F3FF',
        marginBottom: 4,
    },
    sectionSubtitle: {
        fontSize: 14,
        color: '#8B7FA8',
        marginBottom: 16,
    },
    packageCard: {
        backgroundColor: '#2D2640',
        borderRadius: 16,
        padding: 20,
        marginBottom: 12,
        borderWidth: 2,
        borderColor: 'transparent',
    },
    yearlyCard: {
        borderColor: '#7C3AED',
        position: 'relative',
    },
    bestValue: {
        position: 'absolute',
        top: -10,
        right: 16,
        backgroundColor: '#7C3AED',
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 12,
    },
    bestValueText: {
        fontSize: 12,
        fontWeight: '600',
        color: '#FFFFFF',
    },
    packageTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#F5F3FF',
    },
    packagePrice: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#A78BFA',
        marginTop: 4,
    },
    packageInfo: {
        fontSize: 13,
        color: '#8B7FA8',
        marginTop: 4,
    },
    coinPackage: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
    },
    coinPackageEmoji: {
        fontSize: 20,
    },
    restoreButton: {
        alignItems: 'center',
        paddingVertical: 16,
    },
    restoreText: {
        fontSize: 14,
        color: '#8B7FA8',
        textDecorationLine: 'underline',
    },
    loadingOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(26, 22, 37, 0.9)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 12,
        fontSize: 16,
        color: '#F5F3FF',
    },
});
