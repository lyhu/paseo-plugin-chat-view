import { useEffect, useMemo, useRef, useState } from "react";
import { Text, TextInput, View } from "react-native";
import { StyleSheet } from "react-native";
import {
  useRpc,
  useSettings,
  type PluginSurfaceProps,
  type SettingsState,
} from "@getpaseo/plugin/client";
import {
  SettingsAction,
  SettingsCard,
  SettingsRow,
  SettingsSection,
  SettingsSelect,
  SettingsSwitch,
} from "@getpaseo/plugin/client/ui";
import { resolveLocale, t, type LocalePreference, type TranslationKey } from "../shared/i18n";
import { testEnhanceConnectionRpc, type TestConnectionResult } from "../shared/enhance";
import { describeError } from "../shared/enhance/run";
import { useLocale } from "./locale";
import {
  activitySettings,
  paletteModeSchema,
  displayModeSchema,
  languageModeSchema,
  type ChatViewSettings,
} from "../shared/settings";

type ReadySettings = Extract<SettingsState<typeof activitySettings.schema>, { status: "ready" }>;

const styles = StyleSheet.create({
  field: { gap: 6, paddingVertical: 8 },
  fieldLabel: { fontSize: 13, fontWeight: "600" },
  fieldHint: { fontSize: 12, lineHeight: 17 },
});

/** Option values belong to the settings schema; only their labels are translated. */
const displayModeChoices: readonly {
  value: ChatViewSettings["displayMode"];
  labelKey: TranslationKey;
}[] = [
  { value: "folded", labelKey: "settings.displayModeFolded" },
  { value: "detailed", labelKey: "settings.displayModeDetailed" },
];

const displayModeDescriptions: Record<ChatViewSettings["displayMode"], TranslationKey> = {
  folded: "settings.displayModeFoldedDesc",
  detailed: "settings.displayModeDetailedDesc",
};

const paletteChoices: readonly { value: ChatViewSettings["palette"]; labelKey: TranslationKey }[] =
  [
    { value: "vivid", labelKey: "settings.paletteVivid" },
    { value: "soft", labelKey: "settings.paletteSoft" },
    { value: "high_contrast", labelKey: "settings.paletteHighContrast" },
  ];

const paletteDescriptions: Record<ChatViewSettings["palette"], TranslationKey> = {
  vivid: "settings.paletteVividDesc",
  soft: "settings.paletteSoftDesc",
  high_contrast: "settings.paletteHighContrastDesc",
};

const languageChoices: readonly { value: LocalePreference; labelKey: TranslationKey }[] = [
  { value: "auto", labelKey: "settings.langAuto" },
  { value: "zh-CN", labelKey: "settings.langZh" },
  { value: "en-US", labelKey: "settings.langEn" },
];

/**
 * The host lays settings rows out as label-beside-control, which caps a control at roughly half
 * the row width. Long endpoints and keys would be clipped, so these fields stack instead: the
 * label and hint sit above a full-width input.
 */
function FullWidthField(props: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  theme: PluginSurfaceProps["theme"];
}) {
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: props.theme.colors.foreground }]}>
        {props.label}
      </Text>
      {props.hint ? (
        <Text style={[styles.fieldHint, { color: props.theme.colors.foregroundMuted }]}>
          {props.hint}
        </Text>
      ) : null}
      {props.children}
    </View>
  );
}

/** How long a text field waits, after the last keystroke, before it commits. */
const commitDelayMs = 300;

/**
 * Settings writes carry the revision they were based on, and the host rejects a write whose revision
 * predates the stored one (plugins/settings/index.ts → `status: "conflict"`). Committing on every
 * keystroke therefore races the round trip: a character typed before the previous save landed is
 * dropped, and the field snaps back to the stored value. These fields edit a local draft instead and
 * commit it once typing pauses, which also turns a burst of typing into a single write. Switches and
 * selects stay immediate — a click is one event and cannot race itself.
 */
function DraftField(props: {
  label: string;
  hint: string;
  value: string;
  placeholder: string;
  inputStyle: React.ComponentProps<typeof TextInput>["style"];
  secure?: boolean;
  theme: PluginSurfaceProps["theme"];
  onCommit: (value: string) => void;
}) {
  const { value, onCommit, theme } = props;
  const [draft, setDraft] = useState(value);
  const [immediate, setImmediate] = useState(false);
  const commit = useRef(onCommit);
  useEffect(() => {
    commit.current = onCommit;
  });
  // A host value that differs from the draft is newer truth than anything typed here.
  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (draft === value) return;
    const timer = setTimeout(() => commit.current(draft), immediate ? 0 : commitDelayMs);
    return () => clearTimeout(timer);
  }, [draft, value, immediate]);
  return (
    <FullWidthField label={props.label} hint={props.hint} theme={theme}>
      <TextInput
        value={draft}
        placeholder={props.placeholder}
        accessibilityLabel={props.label}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        spellCheck={false}
        secureTextEntry={props.secure}
        // Leaving the field commits at once, so a button beside it never acts on a stale draft.
        onBlur={() => {
          if (draft !== value) setImmediate(true);
        }}
        onChangeText={(next) => {
          setImmediate(false);
          setDraft(next);
        }}
        style={[props.inputStyle, { color: theme.colors.foreground }]}
      />
    </FullWidthField>
  );
}

function ReadyControls({
  settings,
  theme,
}: {
  settings: ReadySettings;
  theme: PluginSurfaceProps["theme"];
}) {
  const descriptionStyle = useMemo(
    () => ({ color: theme.colors.foregroundMuted, fontSize: 13, lineHeight: 18 }),
    [theme.colors.foregroundMuted],
  );
  const errorStyle = useMemo(
    () => ({ color: theme.colors.statusDanger, fontSize: 13, lineHeight: 18 }),
    [theme.colors.statusDanger],
  );
  const inputStyle = useMemo(
    () => ({
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 8,
      backgroundColor: theme.colors.surface1,
      paddingHorizontal: 10,
      paddingVertical: 8,
      fontSize: 13,
      // One line, scrolled rather than clipped: the value stays readable at any width.
      height: 34,
    }),
    [theme.colors.border, theme.colors.surface1],
  );
  const testConnection = useRpc(testEnhanceConnectionRpc);
  // A field commits a pause after the last keystroke, so by then another field may have saved and
  // re-rendered. Both halves of the write are read at call time, or one field's delayed commit
  // would revert another field's edit.
  const live = useRef(settings);
  live.current = settings;
  const commitValues = (patch: Partial<ChatViewSettings>) => {
    const current = live.current;
    void current.save({ ...current.values, ...patch }, current.revision);
  };
  const [testing, setTesting] = useState(false);
  const [connection, setConnection] = useState<TestConnectionResult | undefined>(undefined);
  const runConnectionTest = async () => {
    setTesting(true);
    setConnection(undefined);
    try {
      setConnection(
        await testConnection({
          baseUrl: settings.values.enhanceBaseUrl,
          apiKey: settings.values.enhanceApiKey,
          model: settings.values.enhanceModel,
          locale,
        }),
      );
    } catch (error) {
      setConnection({
        ok: false,
        message: describeError(error),
        latencyMs: 0,
        endpoint: "",
      });
    } finally {
      setTesting(false);
    }
  };
  const changeDisplayMode = (value: string) => {
    const parsed = displayModeSchema.safeParse(value);
    if (!parsed.success) return;
    void settings.save({ ...settings.values, displayMode: parsed.data }, settings.revision);
  };
  const changePalette = (value: string) => {
    const parsed = paletteModeSchema.safeParse(value);
    if (!parsed.success) return;
    void settings.save({ ...settings.values, palette: parsed.data }, settings.revision);
  };
  const locale = resolveLocale(settings.values.language);
  function labels<Value extends string>(
    choices: readonly { value: Value; labelKey: TranslationKey }[],
  ) {
    return choices.map((choice) => ({ value: choice.value, label: t(locale, choice.labelKey) }));
  }
  return (
    <>
      <SettingsSection title={t(locale, "settings.sectionFeatures")}>
        <SettingsCard>
          <SettingsSwitch
            label={t(locale, "settings.mermaidLabel")}
            hint={t(locale, "settings.mermaidHint")}
            value={settings.values.mermaidEnabled}
            disabled={settings.saving}
            onValueChange={(mermaidEnabled) => {
              void settings.save({ ...settings.values, mermaidEnabled }, settings.revision);
            }}
          />
          <SettingsSwitch
            label={t(locale, "settings.compactActivityLabel")}
            hint={t(locale, "settings.compactActivityHint")}
            value={settings.values.compactActivityEnabled}
            disabled={settings.saving}
            onValueChange={(compactActivityEnabled) => {
              void settings.save({ ...settings.values, compactActivityEnabled }, settings.revision);
            }}
          />
          <SettingsSwitch
            label={t(locale, "settings.stickyLabel")}
            hint={t(locale, "settings.stickyHint")}
            value={settings.values.stickyEnabled}
            disabled={settings.saving}
            onValueChange={(stickyEnabled) => {
              void settings.save({ ...settings.values, stickyEnabled }, settings.revision);
            }}
          />
          <SettingsSwitch
            label={t(locale, "settings.readonlyLabel")}
            hint={t(locale, "settings.readonlyHint")}
            value={settings.values.readonlyMessagesEnabled}
            disabled={settings.saving}
            onValueChange={(readonlyMessagesEnabled) => {
              void settings.save(
                { ...settings.values, readonlyMessagesEnabled },
                settings.revision,
              );
            }}
          />
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title={t(locale, "settings.sectionCompact")}>
        <SettingsCard>
          <SettingsSelect
            label={t(locale, "settings.displayModeLabel")}
            hint={t(locale, displayModeDescriptions[settings.values.displayMode])}
            value={settings.values.displayMode}
            options={labels(displayModeChoices)}
            disabled={settings.saving || !settings.values.compactActivityEnabled}
            onValueChange={changeDisplayMode}
          />
          <SettingsSelect
            label={t(locale, "settings.paletteLabel")}
            hint={t(locale, paletteDescriptions[settings.values.palette])}
            value={settings.values.palette}
            options={labels(paletteChoices)}
            disabled={settings.saving || !settings.values.compactActivityEnabled}
            onValueChange={changePalette}
          />
        </SettingsCard>
        <SettingsRow label={t(locale, "settings.behaviorLabel")}>
          <Text style={descriptionStyle}>{t(locale, "settings.behaviorDesc")}</Text>
        </SettingsRow>
        {settings.saveError ? (
          <Text accessibilityRole="alert" style={errorStyle}>
            {settings.saveError}
          </Text>
        ) : null}
      </SettingsSection>
      <SettingsSection title={t(locale, "settings.sectionLanguage")}>
        <SettingsCard>
          <SettingsSelect
            label={t(locale, "settings.languageLabel")}
            hint={t(locale, "settings.languageHint")}
            value={settings.values.language}
            options={labels(languageChoices)}
            disabled={settings.saving}
            onValueChange={(value) => {
              const parsed = languageModeSchema.safeParse(value);
              if (!parsed.success) return;
              void settings.save({ ...settings.values, language: parsed.data }, settings.revision);
            }}
          />
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title={t(locale, "settings.sectionEnhance")}>
        <SettingsCard>
          <SettingsSwitch
            label={t(locale, "settings.enhanceEnableLabel")}
            hint={t(locale, "settings.enhanceEnableHint")}
            value={settings.values.enhanceEnabled}
            disabled={settings.saving}
            onValueChange={(enhanceEnabled) => {
              void settings.save({ ...settings.values, enhanceEnabled }, settings.revision);
            }}
          />
          <DraftField
            label={t(locale, "settings.apiEndpointLabel")}
            hint={t(locale, "settings.apiEndpointHint")}
            placeholder="https://api.openai.com/v1"
            value={settings.values.enhanceBaseUrl}
            inputStyle={inputStyle}
            theme={theme}
            onCommit={(enhanceBaseUrl) => commitValues({ enhanceBaseUrl })}
          />
          <DraftField
            label={t(locale, "settings.apiKeyLabel")}
            hint={t(locale, "settings.apiKeyHint")}
            placeholder="sk-..."
            value={settings.values.enhanceApiKey}
            inputStyle={inputStyle}
            secure
            theme={theme}
            onCommit={(enhanceApiKey) => commitValues({ enhanceApiKey })}
          />
          <DraftField
            label={t(locale, "settings.modelLabel")}
            hint={t(locale, "settings.modelHint")}
            placeholder="gpt-4o-mini"
            value={settings.values.enhanceModel}
            inputStyle={inputStyle}
            theme={theme}
            onCommit={(enhanceModel) => commitValues({ enhanceModel })}
          />
        </SettingsCard>
        <SettingsAction
          label={t(locale, "settings.testConnection")}
          hint={t(locale, "settings.testConnectionHint")}
          actionLabel={testing ? t(locale, "settings.testing") : t(locale, "settings.testBtn")}
          disabled={testing || settings.saving}
          onPress={() => void runConnectionTest()}
        />
        {connection ? (
          <SettingsRow
            label={t(locale, "settings.testResult")}
            hint={
              connection.ok
                ? `${connection.message} · ${connection.latencyMs} ms · ${connection.endpoint}`
                : undefined
            }
            error={connection.ok ? null : connection.message}
          />
        ) : null}
        <SettingsRow label={t(locale, "settings.enhanceNoteLabel")}>
          <Text style={descriptionStyle}>{t(locale, "settings.enhanceNoteDesc")}</Text>
        </SettingsRow>
      </SettingsSection>
    </>
  );
}

export function ActivitySettings({
  theme,
  onSettingsChange,
}: PluginSurfaceProps & {
  onSettingsChange: (values: ChatViewSettings) => void;
}) {
  const settings = useSettings(activitySettings);
  const values = settings.status === "ready" ? settings.values : undefined;
  useEffect(() => {
    if (values) onSettingsChange(values);
  }, [values, onSettingsChange]);
  const textStyle = useMemo(() => ({ color: theme.colors.foreground }), [theme.colors.foreground]);
  // The shells render before settings are known, so they follow the running language.
  const locale = useLocale();
  if (settings.status === "loading")
    return <Text style={textStyle}>{t(locale, "settings.loading")}</Text>;
  if (settings.status === "error") {
    return (
      <SettingsSection title={t(locale, "settings.title")}>
        <Text style={textStyle}>{settings.error}</Text>
        <SettingsAction
          label={t(locale, "settings.title")}
          actionLabel={t(locale, "settings.reload")}
          onPress={settings.reload}
        />
      </SettingsSection>
    );
  }
  if (settings.status === "invalid") {
    return (
      <SettingsSection title={t(locale, "settings.title")}>
        <Text style={textStyle}>{settings.error}</Text>
        <SettingsAction
          label={t(locale, "settings.storedSettings")}
          actionLabel={t(locale, "settings.reset")}
          onPress={settings.reset}
        />
        <SettingsAction
          label={t(locale, "settings.storedSettings")}
          actionLabel={t(locale, "settings.reload")}
          onPress={settings.reload}
        />
      </SettingsSection>
    );
  }
  return <ReadyControls settings={settings} theme={theme} />;
}
