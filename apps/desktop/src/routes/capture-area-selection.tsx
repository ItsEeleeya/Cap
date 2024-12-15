import Cropper, { createCropStore } from "~/components/Cropper";

export default function () {
  const [crop, setCrop] = createCropStore();

  return <div class="w-[80%] h-screen overflow-hidden">
    <Cropper
      cropStore={[crop, setCrop]}
    />
  </div>
}
