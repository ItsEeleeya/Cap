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



                         
