int sub_184b4f4f0(int arg0) {
    var_40 = r26;
    r31 = r31 + 0xffffffffffffffb0 - 0x80;
    r19 = arg0;
    loc_1edd322a8(sub_185a70cec() + 0xfffffffffffffff8);
    r22 = &var_C0 - (r8 + 0xf & 0xfffffffffffffff0);
    &var_C0 = r22;
    r20[*objc_ivar_offset_NSGlassEffectView__variant] = 0x0;
    r20[*objc_ivar_offset_NSGlassEffectView__subvariant] = 0x0;
    r20[*objc_ivar_offset_NSGlassEffectView__interactionState] = 0x0;
    r20[*objc_ivar_offset_NSGlassEffectView__subduedState] = 0x0;
    r20[*objc_ivar_offset_NSGlassEffectView__scrimState] = 0x0;
    r20[*objc_ivar_offset_NSGlassEffectView__contentLensing] = 0x0;
    r20[*objc_ivar_offset_NSGlassEffectView__adaptiveAppearance] = 0x2;
    r20[*objc_ivar_offset_NSGlassEffectView__useReducedShadowRadius] = 0x0;
    r8 = *objc_ivar_offset_NSGlassEffectView__groupIdentifier;
    *(r20 + r8) = 0x0;
    *(r20 + r8 + 0x8) = 0x0;
    r20[*objc_ivar_offset_NSGlassEffectView__tintColor] = 0x0;
    r20[*objc_ivar_offset_NSGlassEffectView__actualCornerRadius] = 0x4020000000000000;
    r20[*objc_ivar_offset_NSGlassEffectView___path] = 0x0;
    r20[*objc_ivar_offset_NSGlassEffectView__contentViewConstraints] = *0x1e5baef70;
    r20[*objc_ivar_offset_NSGlassEffectView__contentView] = 0x0;
    r20[*objc_ivar_offset_NSGlassEffectView__contentHolderView] = [objc_allocWithZone(swift_getObjCClassFromMetadata(sub_184b55518())) init];
    r20[*objc_ivar_offset_NSGlassEffectView__effectsViewIfExists] = 0x0;
    swift_unknownObjectWeakInit();
    r20[*objc_ivar_offset_NSGlassEffectView__disableEmbeddingCount] = 0x0;
    r24 = *objc_ivar_offset_NSGlassEffectView__swiftStorage;
    r0 = sub_184b55538();
    r21 = swift_allocObject(r0, r0[0xc], r0[0x1a]);
    r25 = *objc_ivar_offset__TtCE6AppKitCSo17NSGlassEffectViewP33_92F0BB6107B916AA04C9A991F505A16412SwiftStorage__lastLayoutAnimationState;
    r0 = sub_184b55558();
    (r0[0xffffffffffffffff] + 0x38 | 0xa0d1000000000000)(r21 + r25, 0x1, 0x1, r0);
    *(r20 + r24) = r21;
    var_50 = r20;
    r0 = [[&var_50 super] initWithCoder:r19];
    r21 = r0;
    if (r0 != 0x0) {
            r20 = [r21 retain];
            r0 = sub_184b4eb30();
            r23 = r20[*objc_ivar_offset_NSGlassEffectView__contentHolderView];
            sub_184b55578(r0);
            r25 = [r23 retain];
            sub_184b4dd08();
            r23 = [r20 retain];
            r20 = sub_184b76bb8(r22, r21);
            [r23 release];
            [r25 set_glassMaterialContext:r20];
            [r25 release];
            [r20 release];
            r22 = sub_185a7419c();
            r20 = [[r19 decodeObjectForKey:r22] retain];
            [r22 release];
            if (r20 != 0x0) {
                    sub_185a7503c();
                    swift_unknownObjectRelease(r20);
            }
            else {
                    var_B0 = q0;
                    var_A0 = q0;
            }
            var_90 = var_B0;
            var_80 = var_A0;
            if (var_78 != 0x0) {
                    r0 = sub_184b10728(&var_90, &decomp_var_70);
                    r0 = sub_184b0fe18(0x0, qword_1ec7af210, &@class(NSView));
                    r0 = swift_dynamicCast(&var_B8, &decomp_var_70, *0x1e5baef50 + 0x8, r0, 0x7);
                    r20 = var_B8;
            }
            else {
                    r0 = sub_184b21a34(&var_90, 0x1e9e60600, 0x185b66890);
                    r20 = 0x0;
            }
            [r23 setContentView:r20];
            [r23 release];
            [r19 release];
            r19 = r20;
    }
    [r19 release];
    r0 = r21;
    &var_C0 = &var_40;
    return r0;
}



// 

    ; 
                             ; @class _NSGlassEffectViewMaterialContext : (null) {
                             ;     ivar _style
                             ;     ivar _material
                             ;     -init
                             ;     -.cxx_destruct
                             ;     -copyWithZone:
                             ; }
                     _OBJC_CLASS_$__NSGlassEffectViewMaterialContext:
00000001ed4067f8         struct __objc_class {                                  ; DATA XREF=-[_NSGlassEffectViewMaterialContext init]+56, qword_1e600edc0, 0x1e601e710
                             _OBJC_METACLASS_$__NSGlassEffectViewMaterialContext, // metaclass
                             0x1ec74ed58,                         // superclass
                             0x1800c7530,                         // cache
                             0x0,                                 // vtable
                             __DATA__NSGlassEffectViewMaterialContext // data
                         }


// ---

                     __PROTOCOLS__NSGlassEffectViewMaterialContext:
00000001ee202738         db  0x01 ; '.'                                         ; DATA XREF=__METACLASS_DATA__NSGlassEffectViewMaterialContext
00000001ee202739         db  0x00 ; '.'
00000001ee20273a         db  0x00 ; '.'
00000001ee20273b         db  0x00 ; '.'
00000001ee20273c         db  0x00 ; '.'
00000001ee20273d         db  0x00 ; '.'
00000001ee20273e         db  0x00 ; '.'
00000001ee20273f         db  0x00 ; '.'
00000001ee202740         db  0xf8 ; '.'
00000001ee202741         db  0x3c ; '<'
00000001ee202742         db  0x4d ; 'M'
00000001ee202743         db  0xec ; '.'
00000001ee202744         db  0x01 ; '.'
00000001ee202745         db  0x00 ; '.'
00000001ee202746         db  0x00 ; '.'
00000001ee202747         db  0x00 ; '.'
                     __METACLASS_DATA__NSGlassEffectViewMaterialContext:
00000001ee202748         struct __objc_data {                                   ; "_NSGlassEffectViewMaterialContext", DATA XREF=_OBJC_METACLASS_$__NSGlassEffectViewMaterialContext
                             0x81,                                // flags
                             40,                                  // instance start
                             40,                                  // instance size
                             0x0,
                             0x0,                                 // ivar layout
                             aNsglasseffectv_185b8bd70,           // name
                             0x0,                                 // base methods
                             __PROTOCOLS__NSGlassEffectViewMaterialContext, // base protocols
                             0x0,                                 // ivars
                             0x0,                                 // weak ivar layout
                             0x0                                  // base properties
                         }
                     __PROTOCOLS__NSGlassEffectViewMaterialContext.40:
00000001ee202790         db  0x01 ; '.'                                         ; DATA XREF=__DATA__NSGlassEffectViewMaterialContext
00000001ee202791         db  0x00 ; '.'
00000001ee202792         db  0x00 ; '.'
00000001ee202793         db  0x00 ; '.'
00000001ee202794         db  0x00 ; '.'
00000001ee202795         db  0x00 ; '.'
00000001ee202796         db  0x00 ; '.'
00000001ee202797         db  0x00 ; '.'
00000001ee202798         db  0xf8 ; '.'
00000001ee202799         db  0x3c ; '<'
00000001ee20279a         db  0x4d ; 'M'
00000001ee20279b         db  0xec ; '.'
00000001ee20279c         db  0x01 ; '.'
00000001ee20279d         db  0x00 ; '.'
00000001ee20279e         db  0x00 ; '.'
00000001ee20279f         db  0x00 ; '.'
                     __IVARS__NSGlassEffectViewMaterialContext:
00000001ee2027a0         struct __objc_ivars {                                  ; DATA XREF=__DATA__NSGlassEffectViewMaterialContext
                             32,                                  // entsize
                             2                                    // count
                         }
00000001ee2027a8         struct __objc_ivar {                                   ; "","_style"
                             objc_ivar_offset__NSGlassEffectViewMaterialContext__style, // offset pointer
                             aStyle_185b8bd9e,                    // name
                             a2408d16+22,                         // type
                             0x3,
                             0x20                                 // size
                         }
00000001ee2027c8         struct __objc_ivar {                                   ; "","_material"
                             objc_ivar_offset__NSGlassEffectViewMaterialContext__material, // offset pointer
                             aMaterial_185b8bda5,                 // name
                             a2408d16+22,                         // type
                             0x3,
                             0x20                                 // size
                         }



                         



                             ; enum DesignLibrary.SliderKnobVisibility..Kind {
                             ;     case automatic
                             ;     case visible
                             ;     case hidden
                             ; }
000000023ff7b0fc         struct __swift_EnumDescriptor {                        ; "Kind"
                             struct __swift_ContextDescriptor {   // context
                                 KIND_Enum|FLG_Unique,            // flags
                                 0x23ff7b0f4-0x23ff7b100,         // parent context
                                 aKind_23ff54440-0x23ff7b104,     // name of the type
                                 sub_23fe2bb14-0x23ff7b108,       // type accessor function pointer
                                 0x23ff80098-0x23ff7b10c          // fields
                             },
                             0x0,                                 // number of cases with payload
                             0x3                                  // number of cases without payload
                         }
                             ; enum DesignLibrary.Slider.Knob {
                             ;     case modifieds0(null)XY
                             ;     case automatic
                             ; }
000000023ff7b118         struct __swift_EnumDescriptor {                        ; "Knob"
                             struct __swift_ContextDescriptor {   // context
                                 KIND_Enum|FLG_Unique|0x100000,   // flags
                                 0x23ff7af74-0x23ff7b11c,         // parent context
                                 aKnob_23ff54488-0x23ff7b120,     // name of the type
                                 sub_23fe2bb24-0x23ff7b124,       // type accessor function pointer
                                 0x23ff80070-0x23ff7b128          // fields
                             },
                             0x1,                                 // number of cases with payload
                             0x1                                  // number of cases without payload
                         }
                             ; struct DesignLibrary.Slider.KnobModifier {
                             ;     var knob: DesignLibrarySlider.Knob
                             ; }
000000023ff7b134         struct __swift_StructDescriptor {                      ; "KnobModifier"
                             struct __swift_ContextDescriptor {   // context
                                 KIND_Struct|FLG_Unique|0x100000, // flags
                                 0x23ff7af74-0x23ff7b138,         // parent context
                                 aKnobmodifier-0x23ff7b13c,       // name of the type
                                 sub_23fe2bbe0-0x23ff7b140,       // type accessor function pointer
                                 0x23ff800cc-0x23ff7b144          // fields
                             },
                             0x1,                                 // number of fields
                             0x2
                         }
000000023ff7b150         db  0xc4 ; '.'                                         ; DATA XREF=sub_23fe2bbf0+4
000000023ff7b151         db  0x00 ; '.'





        ; Range: [0x23ff79ffc; 0x23ff7f368[ (21356 bytes)
        ; File offset : [1564668; 1586024[ (21356 bytes)
        ;   S_REGULAR

000000023ff79ffc         db  0x00 ; '.'                                         ; DATA XREF=0x23ff7a008, 0x23ff7a208, 0x23ff7a278, 0x23ff7a2b4, 0x23ff7a2d0, 0x23ff7a2ec, 0x23ff7a308, 0x23ff7a504, 0x23ff7a574, 0x23ff7a590, 0x23ff7a5ac
000000023ff79ffd         db  0x00 ; '.'
000000023ff79ffe         db  0x00 ; '.'
000000023ff79fff         db  0x00 ; '.'
000000023ff7a000         db  0x00 ; '.'
000000023ff7a001         db  0x00 ; '.'
000000023ff7a002         db  0x00 ; '.'
000000023ff7a003         db  0x00 ; '.'
000000023ff7a004         db  0xb4 ; '.'
000000023ff7a005         db  0x77 ; 'w'
000000023ff7a006         db  0xfd ; '.'
000000023ff7a007         db  0xff ; '.'
                             ; struct DesignLibrary.CABackgroundExtensionView {
                             ;     var _pixelLength: s0(null)XY
                             ;     var _layoutDirection: s0(null)XY
                             ;     var layer: __C.CALayer
                             ;     var blurUnitInsets: s0(null)XY
                             ;     var blurRadius: s0(null)XY
                             ; }
000000023ff7a008         struct __swift_StructDescriptor {                      ; "CABackgroundExtensionView", DATA XREF=sub_23fe0eff0+40
                             struct __swift_ContextDescriptor {   // context
                                 KIND_Struct|FLG_Unique|0x110000, // flags
                                 0x23ff79ffc-0x23ff7a00c,         // parent context
                                 aCabackgroundex-0x23ff7a010,     // name of the type
                                 sub_23fe0eff0-0x23ff7a014,       // type accessor function pointer
                                 0x23ff7f368-0x23ff7a018          // fields
                             },
                             0x5,                                 // number of fields
                             0x2




                             ; struct DesignLibrary.MacSwitchSliderKnob {
                             ;     var interactionState: DesignLibrary.InteractionState
                             ;     var isAnimating: Swift.Bool
                             ;     var isSwitch: Swift.Bool
                             ;     var _colorScheme: s0(null)XY
                             ; }
000000023ff7d710         struct __swift_StructDescriptor {                      ; "MacSwitchSliderKnob", DATA XREF=sub_23fea5140+40
                             struct __swift_ContextDescriptor {   // context
                                 KIND_Struct|FLG_Unique|0x110000, // flags
                                 0x23ff79ffc-0x23ff7d714,         // parent context
                                 aMacswitchslide-0x23ff7d718,     // name of the type
                                 sub_23fea5140-0x23ff7d71c,       // type accessor function pointer
                                 0x23ff82194-0x23ff7d720          // fields
                             },
                             0x4,                                 // number of fields
                             0x2
                         }





                             ; struct DesignLibrary.MacSwitchSliderKnob {
                             ;     var interactionState: DesignLibrary.InteractionState
                             ;     var isAnimating: Swift.Bool
                             ;     var isSwitch: Swift.Bool
                             ;     var _colorScheme: s0(null)XY
                             ; }
000000023ff7d710         struct __swift_StructDescriptor {                      ; "MacSwitchSliderKnob", DATA XREF=sub_23fea5140+40
                             struct __swift_ContextDescriptor {   // context
                                 KIND_Struct|FLG_Unique|0x110000, // flags
                                 0x23ff79ffc-0x23ff7d714,         // parent context
                                 aMacswitchslide-0x23ff7d718,     // name of the type
                                 sub_23fea5140-0x23ff7d71c,       // type accessor function pointer
                                 0x23ff82194-0x23ff7d720          // fields
                             },
                             0x4,                                 // number of fields
                             0x2
                         }





000000023ff827b0         struct __swift_FieldDescriptor {                       ; DATA XREF=0x23ff7d8ec
                             _symbolic _____ 13DesignLibrary21GlassMaterialProviderV13ConfigurationV9LuminanceO-0x23ff827b0, // type
                             0,                                   // super class
                             0x3,                                 // kind
                             0xc,                                 // field record size
                             0x3                                  // number of fields
                         }
000000023ff827c0         struct __swift_FieldRecord {                           ; "initial"
                             0x0,                                 // flags
                             _symbolic Sf-0x23ff827c4,            // type
                             aInitial-0x23ff827c8                 // name
                         }
000000023ff827cc         struct __swift_FieldRecord {                           ; "fixed"
                             0x0,                                 // flags
                             _symbolic Sf-0x23ff827d0,            // type
                             aFixed-0x23ff827d4                   // name
                         }
000000023ff827d8         struct __swift_FieldRecord {                           ; "automatic"
                             0x0,                                 // flags
                             0,                                   // type
                             aAutomatic_23ff76b0f-0x23ff827e0     // name
                         }
000000023ff827e4         struct __swift_FieldDescriptor {                       ; DATA XREF=0x23ff7d9a0
                             _symbolic _____ 13DesignLibrary21GlassMaterialProviderV13ConfigurationV11FocusBorderV-0x23ff827e4, // type
                             0,                                   // super class
                             0x0,                                 // kind
                             0xc,                                 // field record size
                             0x1                                  // number of fields
                         }
000000023ff827f4         struct __swift_FieldRecord {                           ; "offset"
                             0x2,                                 // flags
                             _symbolic _____Sg 7SwiftUI9UnitPointV-0x23ff827f8, // type
                             aOffset-0x23ff827fc                  // name
                         }
000000023ff82800         struct __swift_FieldDescriptor {                       ; DATA XREF=0x23ff7d9bc
                             _symbolic _____ 13DesignLibrary21GlassMaterialProviderV13ConfigurationV4TextV-0x23ff82800, // type
                             0,                                   // super class
                             0x0,                                 // kind
                             0xc,                                 // field record size
                             0x2                                  // number of fields
                         }
000000023ff82810         struct __swift_FieldRecord {                           ; "frost"
                             0x2,                                 // flags
                             _symbolic SfSg-0x23ff82814,          // type
                             aFrost_23ff76b31-0x23ff82818         // name
                         }
000000023ff8281c         struct __swift_FieldRecord {                           ; "normalizedFactor"
                             0x2,                                 // flags
                             _symbolic SfSg-0x23ff82820,          // type
                             aNormalizedfact-0x23ff82824          // name
                         }
000000023ff82828         struct __swift_FieldDescriptor {                       ; DATA XREF=0x23ff7d9d8
                             _symbolic _____ 13DesignLibrary21GlassMaterialProviderV21ResolvedContentEffectO-0x23ff82828, // type
                             0,                                   // super class
                             0x2,                                 // kind
                             0xc,                                 // field record size
                             0x3                                  // number of fields
                         }
000000023ff82838         struct __swift_FieldRecord {                           ; "none"
                             0x0,                                 // flags
                             0,                                   // type
                             aNone_23ff76f71-0x23ff82840          // name
                         }
000000023ff82844         struct __swift_FieldRecord {                           ; "clip"
                             0x0,                                 // flags
                             0,                                   // type
                             aClip_23ff76f76-0x23ff8284c          // name
                         }
000000023ff82850         struct __swift_FieldRecord {                           ; "lense"
                             0x0,                                 // flags
                             0,                                   // type
                             aLense_23ff76f7b-0x23ff82858         // name
                         }
000000023ff8285c         struct __swift_FieldDescriptor {                       ; DATA XREF=0x23ff7d9f4
                             _symbolic _____ 13DesignLibrary21GlassMaterialProviderV14CustomFillBaseC-0x23ff8285c, // type
                             0,                                   // super class
                             0x1,                                 // kind
                             0xc,                                 // field record size
                             0x0                                  // number of fields
                         }
000000023ff8286c         struct __swift_FieldDescriptor {                       ; DATA XREF=0x23ff7da50
                             _symbolic _____ 13DesignLibrary21GlassMaterialProviderV10CustomFillC-0x23ff8286c, // type
                             _symbolic _____ 13DesignLibrary21GlassMaterialProviderV14CustomFillBaseC-0x23ff82870, // super class
                             0x1,                                 // kind
                             0xc,                                 // field record size
                             0x1                                  // number of fields
                         }
000000023ff8287c         struct __swift_FieldRecord {                           ; "_provider"
                             0x0,                                 // flags
                             _symbolic x-0x23ff82880,             // type
                             aProvider-0x23ff82884                // name
                         }
000000023ff82888         struct __swift_FieldDescriptor {                       ; DATA XREF=0x23ff7daec
                             _symbolic _____ 13DesignLibrary21GlassMaterialProviderV10CustomGlowV-0x23ff82888, // type
                             0,                                   // super class
                             0x0,                                 // kind
                             0xc,                                 // field record size
                             0x2                                  // number of fields
                         }
000000023ff82898         struct __swift_FieldRecord {                           ; "fill"
                             0x2,                                 // flags
                             _symbolic _____ 13DesignLibrary21GlassMaterialProviderV14CustomFillBaseC-0x23ff8289c, // type
                             aFill_23ff76f8b-0x23ff828a0          // name
                         }
000000023ff828a4         struct __swift_FieldRecord {                           ; "radius"
                             0x2,                                 // flags
                             _symbolic _____ 12CoreGraphics7CGFloatV-0x23ff828a8, // type
                             aRadius-0x23ff828ac                  // name
                         }
000000023ff828b0         struct __swift_FieldDescriptor {                       ; DATA XREF=0x23ff7db08
                             _symbolic _____ 13DesignLibrary21GlassMaterialProviderV7OptionsV-0x23ff828b0, // type
                             0,                                   // super class
                             0x0,                                 // kind
                             0xc,                                 // field record size
                             0x1                                  // number of fields
                         }
000000023ff828c0         struct __swift_FieldRecord {                           ; "rawValue"
                             0x0,                                 // flags
                             _symbolic Su-0x23ff828c4,            // type
                             aRawvalue_23ff76fd4-0x23ff828c8      // name
                         }
000000023ff828cc         struct __swift_FieldDescriptor {                       ; DATA XREF=0x23ff7db24
                             _symbolic _____ 13DesignLibrary21GlassMaterialProviderV16BackgroundFilterV-0x23ff828cc, // type
                             0,                                   // super class
                             0x0,                                 // kind
                             0xc,                                 // field record size
                             0x8                                  // number of fields
                         }
000000023ff828dc         struct __swift_FieldRecord {                           ; "layerIndex"
                             0x2,                                 // flags
                             _symbolic Si-0x23ff828e0,            // type
                             aLayerindex-0x23ff828e4              // name
                         }
000000023ff828e8         struct __swift_FieldRecord {                           ; "shadow"
                             0x2,                                 // flags
                             _symbolic _____ 13DesignLibrary21GlassMaterialProviderV10ParametersV6ShadowV-0x23ff828ec, // type
                             aShadow-0x23ff828f0                  // name
                         }
000000023ff828f4         struct __swift_FieldRecord {                           ; "blur"
                             0x2,                                 // flags
                             _symbolic _____ 13DesignLibrary21GlassMaterialProviderV10ParametersV4BlurV-0x23ff828f8, // type
                             aBlur-0x23ff828fc                    // name
                         }
000000023ff82900         struct __swift_FieldRecord {                           ; "refraction"
                             0x2,                                 // flags
                             _symbolic _____ 13DesignLibrary21GlassMaterialProviderV10ParametersV10RefractionV-0x23ff82904, // type
                             aRefraction-0x23ff82908              // name
                         }
000000023ff8290c         struct __swift_FieldRecord {                           ; "face"
                             0x2,                                 // flags
                             _symbolic _____ 13DesignLibrary21GlassMaterialProviderV10ParametersV11FaceEffectsV-0x23ff82910, // type
                             aFace-0x23ff82914                    // name
                         }
000000023ff82918         struct __swift_FieldRecord {                           ; "bleed"
                             0x2,                                 // flags
                             _symbolic _____ 13DesignLibrary21GlassMaterialProviderV10ParametersV9EdgeBleedV-0x23ff8291c, // type
                             aBleed-0x23ff82920                   // name
                         }
000000023ff82924         struct __swift_FieldRecord {                           ; "sdrAdjustment"
                             0x2,                                 // flags
                             _symbolic _____ 13DesignLibrary21GlassMaterialProviderV10ParametersV13SDRAdjustmentV-0x23ff82928, // type
                             aSdradjustment-0x23ff8292c           // name
                         }
000000023ff82930         struct __swift_FieldRecord {                           ; "flags"
                             0x2,                                 // flags
                             _symbolic _____ 13DesignLibrary21GlassMaterialProviderV16EnvironmentFlagsV-0x23ff82934, // type
                             aFlags-0x23ff82938                   // name
                         }
000000023ff8293c         struct __swift_FieldDescriptor {                       ; DATA XREF=0x23ff7db40
                             _symbolic _____ 13DesignLibrary21GlassMaterialProviderV16ForegroundFilterV-0x23ff8293c, // type
                             0,                                   // super class
                             0x0,                                 // kind
                             0xc,                                 // field record size
                             0x2                                  // number of fields
                         }
000000023ff8294c         struct __swift_FieldRecord {                           ; "layerIndex"
                             0x2,                                 // flags
                             _symbolic Si-0x23ff82950,            // type
                             aLayerindex_23ff7701e-0x23ff82954    // name
                         }