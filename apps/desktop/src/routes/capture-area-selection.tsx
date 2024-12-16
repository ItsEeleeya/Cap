import Cropper, { createCropStore } from "~/components/Cropper";

export default function () {
  const [crop, setCrop] = createCropStore();

  return <div class="w-screen h-screen overflow-hidden">
    <Cropper
      cropStore={[crop, setCrop]}
      mappedSize={{ x: window.innerWidth, y: window.innerHeight }}
      aspectRatio={1/1}
      gridLines={true}
    />
  </div>
}
