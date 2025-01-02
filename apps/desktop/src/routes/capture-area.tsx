import { createEffect, createMemo, onCleanup, onMount, Show } from "solid-js";
import Cropper, { createCropStore, cropFloor as cropToFloor } from "~/components/CropperOLD";
import { EditorButton, Input, MenuItem, MenuItemList, PopperContent } from "./editor/ui";
import { Select as KSelect } from "@kobalte/core/select";
import type { AspectRatio } from "~/utils/tauri";
import { ASPECT_RATIOS } from "./editor/projectConfig";
import { createCurrentRecordingQuery, createOptionsQuery } from "~/utils/queries";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { CanvasSelection } from "~/components/CropperTool";

export default function () {
  const { options, setOptions } = createOptionsQuery();
  const currentRecording = createCurrentRecordingQuery();
  return <div class="w-[600px] h-[400px]">
      <CanvasSelection
        // aspectRatio={1/1}
        width={window.innerWidth}
        height={window.innerHeight}
        class="border border-gray-300"
      />
  </div>

  // return <CaptureAreaCropper options={{ options, setOptions }} />
}

function CaptureAreaCropper(props: {
  options: ReturnType<typeof createOptionsQuery>;
}) {
  const webview = getCurrentWebviewWindow();
  const [crop, setCrop] = createCropStore();
  const cropFloor = createMemo(() => cropToFloor(crop));

  const { options, setOptions } = createOptionsQuery();
  const setPendingState = (pending: boolean) =>
    webview.emitTo("main", "cap-window://capture-area/state/pending", pending);

  onMount(async () => {
    webview.emitTo("main", "cap-window://capture-area/state/pending", true);
    const unlisten = await webview.onCloseRequested(() => setPendingState(false));
    onCleanup(unlisten);
  });

  function handleConfirm() {
    const target = options.data?.captureTarget;
    if (!options.data || !target || target.variant !== "screen") return;
    setPendingState(false);

    setOptions.mutate({
      ...options.data,
      captureTarget: {
        variant: "area",
        screen: target,
        bounds: {
          x: crop.position.x,
          y: crop.position.y,
          width: crop.size.x,
          height: crop.size.y,
        },
      },
    });
  }

  return <div class="w-screen h-screen overflow-hidden">
    <div class="fixed w-full z-50 bg-red-transparent-20 flex items-center justify-center">
      <div class="absolute w-[48rem] h-12 mt-32 bg-gray-50 rounded-lg drop-shadow-2xl border border-1 border-gray-100 flex flex-row-reverse justify-around gap-3 p-1 *:transition-all *:duration-200">
        <div class="flex flex-row">
          <button
            class="py-[0.25rem] px-[0.5rem] text-red-300 dark:red-blue-300 gap-[0.25rem] hover:bg-red-50 flex flex-row items-center rounded-lg"
            type="button"
          >
            <IconCapCircleX />
            <span class="font-[500] text-[0.875rem]">
              Discard
            </span>
          </button>
          <button
            class="py-[0.25rem] px-[0.5rem] text-blue-300 dark:text-blue-300 gap-[0.25rem] hover:bg-blue-50 flex flex-row items-center rounded-lg"
            type="button"
            onClick={handleConfirm}
          >
            <IconCapCircleCheck />
            <span class="font-[500] text-[0.875rem]">
              Confirm selection
            </span>
          </button>
        </div>
        <div class="flex flex-row-reverse">
          <div class="flex flex-row space-x-[0.75rem]">
            {/*<AspectRatioSelect />*/}
            <div class="flex flex-row items-center space-x-[0.5rem] text-gray-400">
              <span>Size</span>
              <div class="w-[3.25rem]">
                <Input value={cropFloor().size.x} class="bg-gray-200" disabled />
              </div>
              <span>x</span>
              <div class="w-[3.25rem]">
                <Input value={cropFloor().size.y} class="bg-gray-200" disabled />
              </div>
            </div>
            <div class="flex flex-row items-center space-x-[0.5rem] text-gray-400">
              <span>Position</span>
              <div class="w-[3.25rem]">
                <Input value={cropFloor().position.x} class="bg-gray-200" disabled />
              </div>
              <span>x</span>
              <div class="w-[3.25rem]">
                <Input
                  class="w-[3.25rem] bg-gray-200"
                  value={cropFloor().position.y}
                  disabled
                />
              </div>
            </div>
          </div>
        </div>
        <AspectRatioSelect />

      </div>
    </div>

    <Cropper
      cropStore={[crop, setCrop]}
      mappedSize={{ x: window.innerWidth, y: window.innerHeight }}
      // aspectRatio={1/1}
      // initialSize={{x: 100, y: 100}}
      gridLines={true}
    />
  </div>
}

function AspectRatioSelect() {
  return (
    <KSelect<AspectRatio | "auto">
      value={"auto"}
      onChange={(v) => {
        if (v === null) return;
      }}
      defaultValue="auto"
      options={
        ["auto", "wide", "vertical", "square", "classic", "tall"] as const
      }
      multiple={false}
      itemComponent={(props) => {
        const item = () =>
          props.item.rawValue === "auto"
            ? null
            : ASPECT_RATIOS[props.item.rawValue];

        return (
          <MenuItem<typeof KSelect.Item> as={KSelect.Item} item={props.item}>
            <KSelect.ItemLabel class="flex-1">
              {props.item.rawValue === "auto"
                ? "Auto"
                : ASPECT_RATIOS[props.item.rawValue].name}
              <Show when={item()}>
                {(item) => (
                  <span class="text-gray-400">
                    {"⋅"}
                    {item().ratio[0]}:{item().ratio[1]}
                  </span>
                )}
              </Show>
            </KSelect.ItemLabel>
            <KSelect.ItemIndicator class="ml-auto">
              <IconCapCircleCheck />
            </KSelect.ItemIndicator>
          </MenuItem>
        );
      }}
      placement="top-start"
    >
      <EditorButton<typeof KSelect.Trigger>
        as={KSelect.Trigger}
        leftIcon={<IconCapLayout />}
        rightIcon={
          <KSelect.Icon>
            <IconCapChevronDown />
          </KSelect.Icon>
        }
      >
        <KSelect.Value<AspectRatio | "auto">>
          {(state) => {
            const text = () => {
              const option = state.selectedOption();
              return option === "auto" ? "Auto" : ASPECT_RATIOS[option].name;
            };
            return <>{text()}</>;
          }}
        </KSelect.Value>
      </EditorButton>
      <KSelect.Portal>
        <PopperContent<typeof KSelect.Content>
          as={KSelect.Content}
        // class={topLeftAnimateClasses}
        >
          <MenuItemList<typeof KSelect.Listbox>
            as={KSelect.Listbox}
            class="w-[12.5rem]"
          />
        </PopperContent>
      </KSelect.Portal>
    </KSelect>
  );
}
