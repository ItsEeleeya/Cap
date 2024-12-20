import Cropper, { createCropStore } from "~/components/Cropper";

export default function () {
  const [crop, setCrop] = createCropStore();

  return <div class="w-screen h-screen overflow-hidden">
    <Cropper
      cropStore={[crop, setCrop]}
      mappedSize={{ x: window.innerWidth, y: window.innerHeight }}
      // aspectRatio={1/1}
      // initialSize={{x: 100, y: 100}}
      gridLines={true}
    />
  </div>
}
