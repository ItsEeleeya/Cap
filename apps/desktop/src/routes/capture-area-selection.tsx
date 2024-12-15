import Cropper, { createCropAreaStore } from "~/components/Cropper";

export default function () {
  const [crop, setCrop] = createCropAreaStore();

  return <div class="w-[80%] h-screen overflow-hidden">
    <Cropper
      cropStore={[crop, setCrop]}
    />
  </div>
}
