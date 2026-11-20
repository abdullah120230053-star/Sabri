import { useEffect, useState, type ComponentType } from "react";
import {
  CloudRain,
  Flame,
  Headphones,
  Music2,
  Pause,
  Play,
  Plus,
  Radio,
  Settings2,
  Volume2,
  Waves,
} from "lucide-react";
import { Howl } from "howler";
import { useTranslation } from "react-i18next";
import { create } from "zustand";
import { active, soundSchema } from "../shared/schema";
import {
  current,
  changeSettings,
  fresh,
  remove,
  save,
  tell,
  useSabri,
} from "./store";
import {
  Button,
  Field,
  FormActions,
  IconButton,
  Modal,
  PageHead,
  Panel,
} from "./ui";
import rain from "./assets/audio/rain.mp3";
import lofi from "./assets/audio/lofi.mp3";
import fireplace from "./assets/audio/fireplace.mp3";
import ocean from "./assets/audio/ocean.mp3";
import cafe from "./assets/audio/cafe.mp3";
import birds from "./assets/audio/birds.mp3";
import whitenoise from "./assets/audio/whitenoise.mp3";

type Track = {
  id: string;
  name: string;
  url: string;
  icon: ComponentType<{ size?: number }>;
  volume: number;
  custom?: boolean;
};
const bundled = [
  ["rain", "Rain", rain, CloudRain],
  ["lofi", "Lo-fi", lofi, Music2],
  ["fireplace", "Fireplace", fireplace, Flame],
  ["ocean", "Ocean", ocean, Waves],
  ["cafe", "Café", cafe, Headphones],
  ["birds", "Birds / nature", birds, Radio],
  ["whitenoise", "White noise", whitenoise, Volume2],
] as const;
const mixer = create<{
  selected: string[];
  toggle(id: string): void;
  stop(): void;
}>((set) => ({
  selected: [],
  toggle: (id) =>
    set((state) => ({
      selected: state.selected.includes(id)
        ? state.selected.filter((item) => item !== id)
        : [...state.selected, id],
    })),
  stop: () => set({ selected: [] }),
}));
const live = new Map<string, Howl>();
const versions = new WeakMap<Howl, number>();
function tracksFor(state: ReturnType<typeof current>): Track[] {
  return [
    ...bundled.map(([id, name, url, icon]) => ({
      id,
      name,
      url,
      icon,
      volume: state.settings.soundVolumes[id] ?? 0.5,
    })),
    ...active(state.sounds).map((item) => ({
      id: item.id,
      name: item.name,
      icon: Music2,
      volume: item.volume,
      url: "sabri-media://sounds/" + item.file,
      custom: true,
    })),
  ];
}
export function useAudioMixer() {
  const selected = mixer((s) => s.selected),
    data = useSabri((s) => s.data),
    stop = mixer((s) => s.stop);

  const lastPrayer = data.notices.findLast(
    (item) => item.kind === "prayer" && !item.reference.endsWith("lead"),
  );
  useEffect(() => {
    if (
      data.settings.musicPauseAtPrayer &&
      lastPrayer &&
      Date.now() - Date.parse(lastPrayer.createdAt) < 5000
    )
      stop();
  }, [lastPrayer?.id, data.settings.musicPauseAtPrayer, stop]);
  useEffect(() => {
    const tracks = tracksFor(data),
      works =
        !data.settings.musicLinkFocus ||
        (data.timer.phase === "focus" && data.timer.status === "running");
    const playing = works
      ? tracks.filter((track) => selected.includes(track.id))
      : [];
    for (const [id, audio] of live) {
      if (!playing.some((item) => item.id === id) && audio.playing()) {
        const version = (versions.get(audio) ?? 0) + 1;
        versions.set(audio, version);
        audio.fade(audio.volume(), 0, 500);
        window.setTimeout(() => {
          if (versions.get(audio) === version && live.get(id) === audio)
            audio.pause();
        }, 530);
      }
      if (!tracks.some((track) => track.id === id)) {
        audio.unload();
        live.delete(id);
      }
    }
    for (const track of playing) {
      let audio = live.get(track.id);
      if (!audio) {
        audio = new Howl({
          src: [track.url],
          html5: true,
          loop: true,
          volume: 0,
          format: track.custom
            ? [track.url.split(".").at(-1) ?? "mp3"]
            : undefined,
        });
        live.set(track.id, audio);
      }
      versions.set(audio, (versions.get(audio) ?? 0) + 1);
      if (!audio.playing()) {
        audio.volume(0);
        audio.play();
        audio.fade(0, track.volume, 580);
      } else if (Math.abs(audio.volume() - track.volume) > 0.03)
        audio.fade(audio.volume(), track.volume, 250);
    }
  }, [selected, data]);
}
export function MusicWidget() {
  const { t } = useTranslation();
  const state = useSabri((s) => s.data),
    selected = mixer((s) => s.selected),
    toggle = mixer((s) => s.toggle),
    stop = mixer((s) => s.stop);
  const first = tracksFor(state)[0]!;
  return (
    <Panel
      title={t("Focus sounds")}
      icon={Headphones}
      action={
        <IconButton
          icon={selected.length ? Pause : Play}
          label={t(selected.length ? "Stop sounds" : "Play rain")}
          onClick={() => (selected.length ? stop() : toggle(first.id))}
        />
      }
    >
      {selected.length ? (
        <p className="muted">
          {tracksFor(state)
            .filter((item) => selected.includes(item.id))
            .map((item) => t(item.name))
            .join(" · ")}
        </p>
      ) : (
        <p className="muted">{t("Rain")}</p>
      )}
    </Panel>
  );
}
export function MusicPage() {
  const { t } = useTranslation(),
    state = useSabri((s) => s.data);
  const { selected, toggle, stop } = mixer();
  const [edit, setEdit] = useState<{
    id: string;
    name: string;
    file: string;
  }>();
  const choose = async () => {
    try {
      const loaded = await window.sabri.addSound();
      if (loaded) setEdit(loaded);
    } catch {
      tell(t("Could not load the audio file."));
    }
  };
  const stored = state.sounds.find(
    (item) => item.id === edit?.id && !item.deletedAt,
  );
  return (
    <>
      <PageHead
        title={t("Focus sounds")}
        description={t("Mix ambient sounds for your next study session.")}
        action={
          <>
            <Button onClick={stop} disabled={!selected.length}>
              {t("Stop sounds")}
            </Button>
            <Button
              variant="primary"
              icon={Plus}
              onClick={() => {
                void choose();
              }}
            >
              {t("Add custom sound")}
            </Button>
          </>
        }
      />
      <div className="toolbar">
        <div className="actions">
          <label className="check-label">
            <input
              type="checkbox"
              checked={state.settings.musicLinkFocus}
              onChange={(e) => {
                void changeSettings({ musicLinkFocus: e.target.checked });
              }}
            />
            {t("Link to focus timer")}
          </label>
          <label className="check-label">
            <input
              type="checkbox"
              checked={state.settings.musicPauseAtPrayer}
              onChange={(e) => {
                void changeSettings({ musicPauseAtPrayer: e.target.checked });
              }}
            />
            {t("Pause sounds at prayer time")}
          </label>
        </div>
      </div>
      <div className="notes-grid">
        {tracksFor(state).map((item) => (
          <Panel
            key={item.id}
            title={t(item.name)}
            icon={Headphones}
            tone={selected.includes(item.id) ? "mint" : "lilac"}
            action={
              <div className="actions">
                {item.custom && (
                  <IconButton
                    icon={Settings2}
                    label={t("Edit")}
                    onClick={() => {
                      const sound = state.sounds.find(
                        (value) => value.id === item.id,
                      );
                      if (sound) setEdit(sound);
                    }}
                  />
                )}
                <IconButton
                  label={
                    t(selected.includes(item.id) ? "Pause" : "Play") +
                    " " +
                    t(item.name)
                  }
                  icon={selected.includes(item.id) ? Pause : Play}
                  onClick={() => toggle(item.id)}
                />
              </div>
            }
          >
            <Field label={t("Volume")}>
              <input
                aria-label={t("Volume") + " " + t(item.name)}
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={item.volume}
                onChange={(e) => {
                  const volume = +e.target.value,
                    custom = current().sounds.find(
                      (sound) => sound.id === item.id,
                    );
                  if (custom) void save("sounds", { ...custom, volume });
                  else
                    void changeSettings({
                      soundVolumes: {
                        ...current().settings.soundVolumes,
                        [item.id]: volume,
                      },
                    });
                }}
              />
            </Field>
          </Panel>
        ))}
      </div>
      {edit && (
        <Modal
          title={t(stored ? "Edit sound" : "Add custom sound")}
          close={() => setEdit(undefined)}
        >
          <form
            className="form-grid"
            onSubmit={async (e) => {
              e.preventDefault();
              const parsed = soundSchema.safeParse({
                ...(stored ?? fresh()),
                ...edit,
                volume: stored?.volume ?? 0.5,
              });
              if (parsed.success && (await save("sounds", parsed.data)))
                setEdit(undefined);
            }}
          >
            <Field label={t("Name")} wide>
              <input
                required
                maxLength={200}
                value={edit.name}
                onChange={(e) => setEdit({ ...edit, name: e.target.value })}
              />
            </Field>
            <FormActions close={() => setEdit(undefined)} />
          </form>
          {stored && (
            <div className="modal-secondary">
              <Button
                variant="danger"
                onClick={() => {
                  void remove("sounds", stored);
                  setEdit(undefined);
                }}
              >
                {t("Delete")}
              </Button>
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
