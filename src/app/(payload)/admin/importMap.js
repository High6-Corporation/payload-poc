import { SlugField as SlugField_2b8867833a34864a02ddf429b0728a40 } from '@payloadcms/next/client'
import { WatchTenantCollection as WatchTenantCollection_1d0591e3cf4f332c83a86da13a0de59a } from '@payloadcms/plugin-multi-tenant/client'
import { TenantField as TenantField_1d0591e3cf4f332c83a86da13a0de59a } from '@payloadcms/plugin-multi-tenant/client'
import { RscEntryLexicalCell as RscEntryLexicalCell_44fe37237e0ebf4470c9990d8cb7b07e } from '@payloadcms/richtext-lexical/rsc'
import { RscEntryLexicalField as RscEntryLexicalField_44fe37237e0ebf4470c9990d8cb7b07e } from '@payloadcms/richtext-lexical/rsc'
import { LexicalDiffComponent as LexicalDiffComponent_44fe37237e0ebf4470c9990d8cb7b07e } from '@payloadcms/richtext-lexical/rsc'
import { InlineToolbarFeatureClient as InlineToolbarFeatureClient_e70f5e05f09f93e00b997edb1ef0c864 } from '@payloadcms/richtext-lexical/client'
import { FixedToolbarFeatureClient as FixedToolbarFeatureClient_e70f5e05f09f93e00b997edb1ef0c864 } from '@payloadcms/richtext-lexical/client'
import { HeadingFeatureClient as HeadingFeatureClient_e70f5e05f09f93e00b997edb1ef0c864 } from '@payloadcms/richtext-lexical/client'
import { ParagraphFeatureClient as ParagraphFeatureClient_e70f5e05f09f93e00b997edb1ef0c864 } from '@payloadcms/richtext-lexical/client'
import { UnderlineFeatureClient as UnderlineFeatureClient_e70f5e05f09f93e00b997edb1ef0c864 } from '@payloadcms/richtext-lexical/client'
import { BoldFeatureClient as BoldFeatureClient_e70f5e05f09f93e00b997edb1ef0c864 } from '@payloadcms/richtext-lexical/client'
import { ItalicFeatureClient as ItalicFeatureClient_e70f5e05f09f93e00b997edb1ef0c864 } from '@payloadcms/richtext-lexical/client'
import { LinkFeatureClient as LinkFeatureClient_e70f5e05f09f93e00b997edb1ef0c864 } from '@payloadcms/richtext-lexical/client'
import { OverviewComponent as OverviewComponent_a8a977ebc872c5d5ea7ee689724c0860 } from '@payloadcms/plugin-seo/client'
import { MetaTitleComponent as MetaTitleComponent_a8a977ebc872c5d5ea7ee689724c0860 } from '@payloadcms/plugin-seo/client'
import { MetaImageComponent as MetaImageComponent_a8a977ebc872c5d5ea7ee689724c0860 } from '@payloadcms/plugin-seo/client'
import { MetaDescriptionComponent as MetaDescriptionComponent_a8a977ebc872c5d5ea7ee689724c0860 } from '@payloadcms/plugin-seo/client'
import { PreviewComponent as PreviewComponent_a8a977ebc872c5d5ea7ee689724c0860 } from '@payloadcms/plugin-seo/client'
import { AssignTenantFieldTrigger as AssignTenantFieldTrigger_1d0591e3cf4f332c83a86da13a0de59a } from '@payloadcms/plugin-multi-tenant/client'
import { HorizontalRuleFeatureClient as HorizontalRuleFeatureClient_e70f5e05f09f93e00b997edb1ef0c864 } from '@payloadcms/richtext-lexical/client'
import { BlocksFeatureClient as BlocksFeatureClient_e70f5e05f09f93e00b997edb1ef0c864 } from '@payloadcms/richtext-lexical/client'
import { FolderTableCell as FolderTableCell_f9c02e79a4aed9a3924487c0cd4cafb1 } from '@payloadcms/next/rsc'
import { FolderField as FolderField_f9c02e79a4aed9a3924487c0cd4cafb1 } from '@payloadcms/next/rsc'
import { FieldBuilderDescription as FieldBuilderDescription_87451853b5e4dda4506551573af35521 } from '@/components/FieldBuilderDescription'
import { FieldBuilder as FieldBuilder_1c50948e29b4615cfbffb2573cce95b9 } from '@/components/FieldBuilder'
import { EntryDataDescription as EntryDataDescription_2c018cd122faced52f94e104735f68e5 } from '@/components/EntryDataDescription'
import { EntryDataField as EntryDataField_3a617193da43b7aa3baaf2653a7fd787 } from '@/components/EntryDataField'
import { LinkToDoc as LinkToDoc_aead06e4cbf6b2620c5c51c9ab283634 } from '@payloadcms/plugin-search/client'
import { ReindexButton as ReindexButton_aead06e4cbf6b2620c5c51c9ab283634 } from '@payloadcms/plugin-search/client'
import { FolderTypeField as FolderTypeField_2b8867833a34864a02ddf429b0728a40 } from '@payloadcms/next/client'
import { RowLabel as RowLabel_ec255a65fa6fa8d1faeb09cf35284224 } from '@/Header/RowLabel'
import { RowLabel as RowLabel_1f6ff6ff633e3695d348f4f3c58f1466 } from '@/Footer/RowLabel'
import { default as default_25bc022b928a59938e027ae5614b16a1 } from '@/components/High6Logo'
import { default as default_1a7510af427896d367a49dbf838d2de6 } from '@/components/BeforeDashboard'
import { default as default_8a7ab0eb7ab5c511aba12e68480bfe5e } from '@/components/BeforeLogin'
import { TenantSelector as TenantSelector_d6d5f193a167989e2ee7d14202901e62 } from '@payloadcms/plugin-multi-tenant/rsc'
import { default as default_8c892067b9a54d9600542ae3b3df7f7d } from '@/components/SidebarOrderFix'
import { S3ClientUploadHandler as S3ClientUploadHandler_f97aa6c64367fa259c5bc0567239ef24 } from '@payloadcms/storage-s3/client'
import { TenantSelectionProvider as TenantSelectionProvider_d6d5f193a167989e2ee7d14202901e62 } from '@payloadcms/plugin-multi-tenant/rsc'
import { CollectionCards as CollectionCards_f9c02e79a4aed9a3924487c0cd4cafb1 } from '@payloadcms/next/rsc'

/** @type import('payload').ImportMap */
export const importMap = {
  "@payloadcms/next/client#SlugField": SlugField_2b8867833a34864a02ddf429b0728a40,
  "@payloadcms/plugin-multi-tenant/client#WatchTenantCollection": WatchTenantCollection_1d0591e3cf4f332c83a86da13a0de59a,
  "@payloadcms/plugin-multi-tenant/client#TenantField": TenantField_1d0591e3cf4f332c83a86da13a0de59a,
  "@payloadcms/richtext-lexical/rsc#RscEntryLexicalCell": RscEntryLexicalCell_44fe37237e0ebf4470c9990d8cb7b07e,
  "@payloadcms/richtext-lexical/rsc#RscEntryLexicalField": RscEntryLexicalField_44fe37237e0ebf4470c9990d8cb7b07e,
  "@payloadcms/richtext-lexical/rsc#LexicalDiffComponent": LexicalDiffComponent_44fe37237e0ebf4470c9990d8cb7b07e,
  "@payloadcms/richtext-lexical/client#InlineToolbarFeatureClient": InlineToolbarFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
  "@payloadcms/richtext-lexical/client#FixedToolbarFeatureClient": FixedToolbarFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
  "@payloadcms/richtext-lexical/client#HeadingFeatureClient": HeadingFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
  "@payloadcms/richtext-lexical/client#ParagraphFeatureClient": ParagraphFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
  "@payloadcms/richtext-lexical/client#UnderlineFeatureClient": UnderlineFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
  "@payloadcms/richtext-lexical/client#BoldFeatureClient": BoldFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
  "@payloadcms/richtext-lexical/client#ItalicFeatureClient": ItalicFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
  "@payloadcms/richtext-lexical/client#LinkFeatureClient": LinkFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
  "@payloadcms/plugin-seo/client#OverviewComponent": OverviewComponent_a8a977ebc872c5d5ea7ee689724c0860,
  "@payloadcms/plugin-seo/client#MetaTitleComponent": MetaTitleComponent_a8a977ebc872c5d5ea7ee689724c0860,
  "@payloadcms/plugin-seo/client#MetaImageComponent": MetaImageComponent_a8a977ebc872c5d5ea7ee689724c0860,
  "@payloadcms/plugin-seo/client#MetaDescriptionComponent": MetaDescriptionComponent_a8a977ebc872c5d5ea7ee689724c0860,
  "@payloadcms/plugin-seo/client#PreviewComponent": PreviewComponent_a8a977ebc872c5d5ea7ee689724c0860,
  "@payloadcms/plugin-multi-tenant/client#AssignTenantFieldTrigger": AssignTenantFieldTrigger_1d0591e3cf4f332c83a86da13a0de59a,
  "@payloadcms/richtext-lexical/client#HorizontalRuleFeatureClient": HorizontalRuleFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
  "@payloadcms/richtext-lexical/client#BlocksFeatureClient": BlocksFeatureClient_e70f5e05f09f93e00b997edb1ef0c864,
  "@payloadcms/next/rsc#FolderTableCell": FolderTableCell_f9c02e79a4aed9a3924487c0cd4cafb1,
  "@payloadcms/next/rsc#FolderField": FolderField_f9c02e79a4aed9a3924487c0cd4cafb1,
  "@/components/FieldBuilderDescription#FieldBuilderDescription": FieldBuilderDescription_87451853b5e4dda4506551573af35521,
  "@/components/FieldBuilder#FieldBuilder": FieldBuilder_1c50948e29b4615cfbffb2573cce95b9,
  "@/components/EntryDataDescription#EntryDataDescription": EntryDataDescription_2c018cd122faced52f94e104735f68e5,
  "@/components/EntryDataField#EntryDataField": EntryDataField_3a617193da43b7aa3baaf2653a7fd787,
  "@payloadcms/plugin-search/client#LinkToDoc": LinkToDoc_aead06e4cbf6b2620c5c51c9ab283634,
  "@payloadcms/plugin-search/client#ReindexButton": ReindexButton_aead06e4cbf6b2620c5c51c9ab283634,
  "@payloadcms/next/client#FolderTypeField": FolderTypeField_2b8867833a34864a02ddf429b0728a40,
  "@/Header/RowLabel#RowLabel": RowLabel_ec255a65fa6fa8d1faeb09cf35284224,
  "@/Footer/RowLabel#RowLabel": RowLabel_1f6ff6ff633e3695d348f4f3c58f1466,
  "@/components/High6Logo#default": default_25bc022b928a59938e027ae5614b16a1,
  "@/components/BeforeDashboard#default": default_1a7510af427896d367a49dbf838d2de6,
  "@/components/BeforeLogin#default": default_8a7ab0eb7ab5c511aba12e68480bfe5e,
  "@payloadcms/plugin-multi-tenant/rsc#TenantSelector": TenantSelector_d6d5f193a167989e2ee7d14202901e62,
  "@/components/SidebarOrderFix#default": default_8c892067b9a54d9600542ae3b3df7f7d,
  "@payloadcms/storage-s3/client#S3ClientUploadHandler": S3ClientUploadHandler_f97aa6c64367fa259c5bc0567239ef24,
  "@payloadcms/plugin-multi-tenant/rsc#TenantSelectionProvider": TenantSelectionProvider_d6d5f193a167989e2ee7d14202901e62,
  "@payloadcms/next/rsc#CollectionCards": CollectionCards_f9c02e79a4aed9a3924487c0cd4cafb1
}
