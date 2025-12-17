import { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    TextInput,
    ActivityIndicator,
    Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/auth';
import type { Series } from '@/types/supabase';
import useI18n from '@/hooks/useI18n';

const LENGTH_OPTIONS = [
    { value: 'kurz', label: 'Kurz', description: '~5 Min' },
    { value: 'normal', label: 'Normal', description: '~8 Min' },
    { value: 'lang', label: 'Lang', description: '~12 Min' },
];

export default function EditSeriesScreen() {
    const router = useRouter();
    const { id } = useLocalSearchParams<{ id: string }>();
    const { user } = useAuth();
    const { t } = useI18n();
    const [series, setSeries] = useState<Series | null>(null);
    const [title, setTitle] = useState('');
    const [locationText, setLocationText] = useState('');
    const [defaultLength, setDefaultLength] = useState('normal');
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        loadSeries();
    }, [id]);

    const loadSeries = async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('series')
                .select('*')
                .eq('id', id)
                .single();

            if (error) throw error;
            setSeries(data);
            setTitle(data.title || '');
            setLocationText(data.location_text || '');
            setDefaultLength(data.default_length || 'normal');
        } catch (error) {
            console.error('Error loading series:', error);
            Alert.alert('Fehler', 'Serie konnte nicht geladen werden.');
            router.back();
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = async () => {
        if (!series) return;

        setIsSaving(true);
        try {
            const { error } = await supabase
                .from('series')
                .update({
                    title: title.trim() || null,
                    location_text: locationText.trim() || null,
                    default_length: defaultLength,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', id);

            if (error) throw error;

            Alert.alert('Gespeichert', 'Die Änderungen wurden gespeichert.', [
                { text: 'OK', onPress: () => router.back() }
            ]);
        } catch (error) {
            console.error('Error saving series:', error);
            Alert.alert('Fehler', 'Die Änderungen konnten nicht gespeichert werden.');
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#A78BFA" />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
            >
                {/* Title */}
                <View style={styles.section}>
                    <Text style={styles.label}>Serientitel</Text>
                    <TextInput
                        style={styles.input}
                        value={title}
                        onChangeText={setTitle}
                        placeholder="z.B. Emmas Abenteuer"
                        placeholderTextColor="#6B5B8A"
                    />
                </View>

                {/* Location */}
                <View style={styles.section}>
                    <Text style={styles.label}>Spielort (optional)</Text>
                    <TextInput
                        style={styles.input}
                        value={locationText}
                        onChangeText={setLocationText}
                        placeholder="z.B. Im Zauberwald"
                        placeholderTextColor="#6B5B8A"
                    />
                    <Text style={styles.hint}>
                        Dieser Ort wird in allen Folgen als Handlungsort verwendet.
                    </Text>
                </View>

                {/* Default Length */}
                <View style={styles.section}>
                    <Text style={styles.label}>Standard-Länge für neue Folgen</Text>
                    <View style={styles.lengthOptions}>
                        {LENGTH_OPTIONS.map((option) => {
                            const isSelected = defaultLength === option.value;
                            return (
                                <TouchableOpacity
                                    key={option.value}
                                    style={[styles.lengthOption, isSelected && styles.lengthOptionSelected]}
                                    onPress={() => setDefaultLength(option.value)}
                                >
                                    <Text style={[styles.lengthLabel, isSelected && styles.lengthLabelSelected]}>
                                        {option.label}
                                    </Text>
                                    <Text style={styles.lengthDescription}>{option.description}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </View>

                {/* Info */}
                <View style={styles.infoBox}>
                    <Ionicons name="information-circle-outline" size={20} color="#A78BFA" />
                    <Text style={styles.infoText}>
                        Kategorie und Charaktere können nicht nachträglich geändert werden,
                        um die Konsistenz der Serie zu gewährleisten.
                    </Text>
                </View>
            </ScrollView>

            {/* Save Button */}
            <View style={styles.footer}>
                <TouchableOpacity
                    style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
                    onPress={handleSave}
                    disabled={isSaving}
                >
                    {isSaving ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                        <>
                            <Ionicons name="checkmark-circle" size={22} color="#FFFFFF" />
                            <Text style={styles.saveButtonText}>Speichern</Text>
                        </>
                    )}
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#1A1625',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#1A1625',
    },
    scrollView: {
        flex: 1,
    },
    content: {
        padding: 16,
        paddingBottom: 100,
    },
    section: {
        marginBottom: 24,
    },
    label: {
        fontSize: 16,
        fontWeight: '600',
        color: '#A78BFA',
        marginBottom: 8,
    },
    input: {
        backgroundColor: '#2D2640',
        borderRadius: 12,
        padding: 16,
        fontSize: 16,
        color: '#F5F3FF',
        borderWidth: 1,
        borderColor: '#4C4270',
    },
    hint: {
        fontSize: 12,
        color: '#8B7FA8',
        marginTop: 6,
    },
    lengthOptions: {
        flexDirection: 'row',
        gap: 10,
    },
    lengthOption: {
        flex: 1,
        backgroundColor: '#2D2640',
        borderRadius: 12,
        padding: 14,
        alignItems: 'center',
        borderWidth: 2,
        borderColor: '#4C4270',
    },
    lengthOptionSelected: {
        borderColor: '#7C3AED',
        backgroundColor: 'rgba(124, 58, 237, 0.1)',
    },
    lengthLabel: {
        fontSize: 15,
        fontWeight: '600',
        color: '#E9E3F5',
        marginBottom: 4,
    },
    lengthLabelSelected: {
        color: '#A78BFA',
    },
    lengthDescription: {
        fontSize: 12,
        color: '#8B7FA8',
    },
    infoBox: {
        backgroundColor: 'rgba(167, 139, 250, 0.1)',
        borderRadius: 12,
        padding: 16,
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        borderWidth: 1,
        borderColor: 'rgba(167, 139, 250, 0.3)',
    },
    infoText: {
        flex: 1,
        fontSize: 13,
        color: '#A78BFA',
        lineHeight: 18,
    },
    footer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: 16,
        paddingBottom: 32,
        backgroundColor: '#1A1625',
        borderTopWidth: 1,
        borderTopColor: '#2D2640',
    },
    saveButton: {
        backgroundColor: '#7C3AED',
        borderRadius: 16,
        padding: 16,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 10,
        shadowColor: '#7C3AED',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    saveButtonDisabled: {
        opacity: 0.7,
    },
    saveButtonText: {
        color: '#FFFFFF',
        fontSize: 17,
        fontWeight: '600',
    },
});
