import Purchases, { LOG_LEVEL, CustomerInfo, PurchasesPackage } from 'react-native-purchases';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from './supabase';

// RevenueCat API Keys
const REVENUECAT_API_KEY_IOS = 'appl_PIwvpCsiOyyzzLJWneZRCvihlWb';
const REVENUECAT_API_KEY_ANDROID = 'goog_REPLACE_WITH_YOUR_PUBLIC_KEY';

// Product IDs from App Store Connect
export const PRODUCT_IDS = {
    PREMIUM_MONTHLY: '1_Monat',
    PREMIUM_YEARLY: '1Jahr',
    COINS_5: '5Coins',
    COINS_1: 'Coins',
};

// Entitlement ID in RevenueCat
const PREMIUM_ENTITLEMENT = 'premium';

let isInitialized = false;

/**
 * Initialize RevenueCat SDK
 */
export const initializePurchases = async (userId: string) => {
    if (isInitialized) return;

    if (Constants.appOwnership === 'expo') {
        console.log('Expo Go detected: RevenueCat initialization skipped');
        return;
    }

    try {
        Purchases.setLogLevel(LOG_LEVEL.DEBUG);

        await Purchases.configure({
            apiKey: Platform.OS === 'ios' ? REVENUECAT_API_KEY_IOS : REVENUECAT_API_KEY_ANDROID,
            appUserID: userId,
        });

        isInitialized = true;
        console.log('RevenueCat initialized for user:', userId);
    } catch (error) {
        console.error('Failed to initialize RevenueCat:', error);
    }
};

/**
 * Get available offerings (subscription packages)
 */
export const getOfferings = async () => {
    if (!isInitialized) {
        // Return mock data for Expo Go
        return {
            availablePackages: [
                { product: { identifier: PRODUCT_IDS.PREMIUM_MONTHLY, priceString: '€7.00' } },
                { product: { identifier: PRODUCT_IDS.PREMIUM_YEARLY, priceString: '€60.00' } },
                { product: { identifier: PRODUCT_IDS.COINS_5, priceString: '€9.00' } },
                { product: { identifier: PRODUCT_IDS.COINS_1, priceString: '€2.00' } },
            ]
        };
    }
    try {
        const offerings = await Purchases.getOfferings();
        return offerings.current;
    } catch (error) {
        console.error('Failed to get offerings:', error);
        return null;
    }
};

/**
 * Purchase a package
 */
export const purchasePackage = async (pkg: PurchasesPackage): Promise<CustomerInfo | null> => {
    if (!isInitialized) {
        console.log('Expo Go: Mocking purchase for', pkg.product.identifier);
        // Simulate success
        return {
            entitlements: { active: {} },
            allPurchasedProductIdentifiers: [pkg.product.identifier],
        } as any;
    }
    try {
        const { customerInfo } = await Purchases.purchasePackage(pkg);
        await syncPurchaseWithSupabase(customerInfo);
        return customerInfo;
    } catch (error: any) {
        if (error.userCancelled) {
            console.log('User cancelled purchase');
        } else {
            console.error('Purchase failed:', error);
        }
        return null;
    }
};

/**
 * Check if user has premium entitlement
 */
export const checkPremiumStatus = async (): Promise<boolean> => {
    if (!isInitialized) return false;
    try {
        const customerInfo = await Purchases.getCustomerInfo();
        return customerInfo.entitlements.active[PREMIUM_ENTITLEMENT] !== undefined;
    } catch (error) {
        console.error('Failed to check premium status:', error);
        return false;
    }
};

/**
 * Get customer info
 */
export const getCustomerInfo = async (): Promise<CustomerInfo | null> => {
    if (!isInitialized) return null;
    try {
        return await Purchases.getCustomerInfo();
    } catch (error) {
        console.error('Failed to get customer info:', error);
        return null;
    }
};

/**
 * Restore purchases (for users who reinstalled)
 */
export const restorePurchases = async (): Promise<CustomerInfo | null> => {
    if (!isInitialized) return null;
    try {
        const customerInfo = await Purchases.restorePurchases();
        await syncPurchaseWithSupabase(customerInfo);
        return customerInfo;
    } catch (error) {
        console.error('Failed to restore purchases:', error);
        return null;
    }
};

/**
 * Sync purchase status with Supabase
 */
const syncPurchaseWithSupabase = async (customerInfo: CustomerInfo) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const isPremium = customerInfo.entitlements.active[PREMIUM_ENTITLEMENT] !== undefined;
    const premiumExpiry = customerInfo.entitlements.active[PREMIUM_ENTITLEMENT]?.expirationDate;

    await supabase.from('profiles').update({
        is_premium: isPremium,
        premium_expires_at: premiumExpiry || null,
    }).eq('id', user.id);
};

/**
 * Add coins after purchase (called after successful coin purchase)
 */
export const addCoins = async (amount: number, description: string = 'Coin purchase') => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    // Update balance
    const { error: updateError } = await supabase.rpc('add_coins', {
        p_user_id: user.id,
        p_amount: amount,
    });

    if (updateError) {
        // Fallback: direct update
        const { data: profile } = await supabase
            .from('profiles')
            .select('coin_balance')
            .eq('id', user.id)
            .single();

        if (profile) {
            await supabase
                .from('profiles')
                .update({ coin_balance: (profile.coin_balance || 0) + amount })
                .eq('id', user.id);
        }
    }

    // Log transaction
    await supabase.from('coin_transactions').insert({
        user_id: user.id,
        amount: amount,
        transaction_type: 'purchase',
        description,
    });

    return true;
};

/**
 * Spend coins (called when creating a story)
 */
export const spendCoin = async (storyId?: string): Promise<boolean> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    // Check balance
    const { data: profile } = await supabase
        .from('profiles')
        .select('coin_balance, is_premium')
        .eq('id', user.id)
        .single();

    if (!profile) return false;

    // Premium users don't spend coins
    if (profile.is_premium) return true;

    // Check if enough coins
    if ((profile.coin_balance || 0) < 1) return false;

    // Deduct coin
    await supabase
        .from('profiles')
        .update({ coin_balance: (profile.coin_balance || 0) - 1 })
        .eq('id', user.id);

    // Log transaction
    await supabase.from('coin_transactions').insert({
        user_id: user.id,
        amount: -1,
        transaction_type: 'use',
        description: 'Geschichte erstellt',
        story_id: storyId,
    });

    return true;
};

/**
 * Get current coin balance
 */
export const getCoinBalance = async (): Promise<{ coins: number; isPremium: boolean; expiresAt: string | null }> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { coins: 0, isPremium: false, expiresAt: null };

    const { data: profile } = await supabase
        .from('profiles')
        .select('coin_balance, is_premium, premium_expires_at')
        .eq('id', user.id)
        .single();

    return {
        coins: profile?.coin_balance || 0,
        isPremium: profile?.is_premium || false,
        expiresAt: profile?.premium_expires_at || null,
    };
};
