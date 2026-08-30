#include "CVizzlyPreviewRuntime.h"

#if defined(__APPLE__)
#include <TargetConditionals.h>
#endif

#if defined(TARGET_OS_IOS) && TARGET_OS_IOS && TARGET_OS_SIMULATOR
extern void vizzly_preview_replacement(void)
  __asm("_VizzlyPreviewInitializerReplacement");
extern void swiftui_preview_initializer(void)
  __asm("_$s21DeveloperToolsSupport7PreviewV7SwiftUIE_6traits4bodyACSSSg_AA0D5TraitVyAC10ViewTraitsOGdAD0J0_pyScMYcctcfC");

__attribute__((used))
static struct {
  const void *replacement;
  const void *replacee;
} interposers[] __attribute__((section("__DATA,__interpose"))) = {
  { (const void *)&vizzly_preview_replacement,
    (const void *)&swiftui_preview_initializer }
};

void *VizzlyOriginalPreviewInitializer(void) {
  return (void *)interposers[0].replacee;
}
#endif

__attribute__((constructor))
static void start_vizzly_preview_runtime(void) {
  VizzlyPreviewRuntimeStart();
}
