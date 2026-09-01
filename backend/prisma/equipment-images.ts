import type { EquipmentType } from "@prisma/client";

/**
 * Photographs for the fleet, by machine type.
 *
 * Sourced from Wikimedia Commons and **baked in as literals on purpose**. The
 * seed is required to be deterministic — `seed:verify` asserts three
 * consecutive runs produce byte-identical data — so it cannot call a search API
 * at seed time and get whatever that returns today. Every URL below was fetched
 * and confirmed to return `200` with an `image/*` content type when this file
 * was written.
 *
 * All are openly licensed (CC BY / CC BY-SA / CC0); the licence and author are
 * kept beside each URL because attribution is a condition of most of them, and
 * a bare URL list makes that impossible to honour later.
 *
 * `upload.wikimedia.org` is the canonical CDN host. It must also be listed in
 * `frontend/next.config.ts` under `images.remotePatterns`, or `next/image`
 * refuses to load these.
 */
export type EquipmentPhoto = { url: string; title: string; license: string; artist: string };

export const EQUIPMENT_PHOTOS: Record<EquipmentType, EquipmentPhoto[]> = {
  EXCAVATOR: [
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d8/Caterpillar_330_excavator_on_a_pile_of_dirt.jpg/1280px-Caterpillar_330_excavator_on_a_pile_of_dirt.jpg",
      title: "Caterpillar 330 excavator on a pile of dirt.jpg",
      license: "CC BY-SA 4.0",
      artist: "Matthew T Rader",
    },
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Caterpillar_302.7D_excavator_on_Barrow_Street.jpg/1280px-Caterpillar_302.7D_excavator_on_Barrow_Street.jpg",
      title: "Caterpillar 302.7D excavator on Barrow Street.jpg",
      license: "CC BY-SA 4.0",
      artist: "Grendelkhan",
    },
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0e/Doosan_DX85R-3_excavator_in_Remiremont%2C_France_-_2022-05-03_-_01.jpg/1280px-Doosan_DX85R-3_excavator_in_Remiremont%2C_France_-_2022-05-03_-_01.jpg",
      title: "Doosan DX85R-3 excavator in Remiremont, France - 2022-05-03 - 01.jpg",
      license: "CC BY-SA 4.0",
      artist: "Mathieu Kappler",
    },
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0d/Pala_excavadora.jpg/1280px-Pala_excavadora.jpg",
      title: "Pala excavadora.jpg",
      license: "CC BY-SA 4.0",
      artist: "Rjcastillo",
    },
  ],
  CRANE: [
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/30/A_Liebherr_LTM_1500-8.1_crane_truck_in_Taiwan_01.jpg/1280px-A_Liebherr_LTM_1500-8.1_crane_truck_in_Taiwan_01.jpg",
      title: "A Liebherr LTM 1500-8.1 crane truck in Taiwan 01.jpg",
      license: "CC BY-SA 4.0",
      artist: "Tbatb",
    },
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/41/TATRA_148_-_AB_063.2_mobile_crane_-_01.jpg/1280px-TATRA_148_-_AB_063.2_mobile_crane_-_01.jpg",
      title: "TATRA 148 - AB 063.2 mobile crane - 01.jpg",
      license: "CC BY 4.0",
      artist: "Oto Zapletal",
    },
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/d/df/Crane_dz.jpg",
      title: "Crane dz.jpg",
      license: "CC BY-SA 4.0",
      artist: "Naser goudjil",
    },
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9d/332M3_hoisted_by_two_crane_trucks_outside_Bei%27anhe_Depot_%2820240331075625%29.jpg/1280px-332M3_hoisted_by_two_crane_trucks_outside_Bei%27anhe_Depot_%2820240331075625%29.jpg",
      title: "332M3 hoisted by two crane trucks outside Bei'anhe Depot (20240331075625).jpg",
      license: "CC BY-SA 4.0",
      artist: "N509FZ",
    },
  ],
  BULLDOZER: [
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/10/Caterpillar_Crawler%2C_Bulldozer_%2850920115152%29.jpg/1280px-Caterpillar_Crawler%2C_Bulldozer_%2850920115152%29.jpg",
      title: "Caterpillar Crawler, Bulldozer (50920115152).jpg",
      license: "CC BY 2.0",
      artist: "Martin Pettitt from Bury St Edmunds, UK",
    },
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Bulldozer_Snow_Clearance_Shinko_La_Lungnak_Jun24_A7CR_00326.jpg/1280px-Bulldozer_Snow_Clearance_Shinko_La_Lungnak_Jun24_A7CR_00326.jpg",
      title: "Bulldozer Snow Clearance Shinko La Lungnak Jun24 A7CR 00326.jpg",
      license: "CC BY-SA 4.0",
      artist: "This Photo was taken by Timothy A. Gonsalves.  Feel free to ",
    },
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/a/a3/Bulldozer_on_road_construction.jpg",
      title: "Bulldozer on road construction.jpg",
      license: "CC BY-SA 4.0",
      artist: "dayacharan",
    },
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/7/77/John_Deere_crawler_2008.jpg",
      title: "John Deere crawler 2008.jpg",
      license: "CC BY-SA 2.0",
      artist: "jill, jellidonut... whatever",
    },
  ],
  GRADER: [
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/06/Budowa_Velostrady_nr_6_-_odcinek_Katowice_Bryn%C3%B3w_-_Katowice_Bryn%C3%B3w%2C_wyr%C3%B3wnywarka_oraz_walec_podczas_pracy.jpg/1280px-Budowa_Velostrady_nr_6_-_odcinek_Katowice_Bryn%C3%B3w_-_Katowice_Bryn%C3%B3w%2C_wyr%C3%B3wnywarka_oraz_walec_podczas_pracy.jpg",
      title: "Budowa Velostrady nr 6 - odcinek Katowice Brynów - Katowice Brynów, wyrównywarka oraz walec podczas pracy.jpg",
      license: "CC BY 4.0",
      artist: "Krzysztof Popławski",
    },
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/Vedligehold_af_grusvej.jpg/1280px-Vedligehold_af_grusvej.jpg",
      title: "Vedligehold af grusvej.jpg",
      license: "CC BY-SA 4.0",
      artist: "Hjart",
    },
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/be/Caterpillar_motor_grader_left_AGSEM.jpg/1280px-Caterpillar_motor_grader_left_AGSEM.jpg",
      title: "Caterpillar motor grader left AGSEM.jpg",
      license: "CC BY-SA 4.0",
      artist: "Eric Polk",
    },
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/19/Caterpillar_motor_grader_front_AGSEM.jpg/1280px-Caterpillar_motor_grader_front_AGSEM.jpg",
      title: "Caterpillar motor grader front AGSEM.jpg",
      license: "CC BY-SA 4.0",
      artist: "Eric Polk",
    },
  ],
  LOADER: [
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/50/CASE_321F_Compact_Wheel_Loader%2C_Windsor%2C_Ontario%2C_2025-06-23.jpg/1280px-CASE_321F_Compact_Wheel_Loader%2C_Windsor%2C_Ontario%2C_2025-06-23.jpg",
      title: "CASE 321F Compact Wheel Loader, Windsor, Ontario, 2025-06-23.jpg",
      license: "CC BY-SA 4.0",
      artist: "Crisco 1492",
    },
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/CATERPILLAR_950_GC_Wheel_Loader_05.jpg/1280px-CATERPILLAR_950_GC_Wheel_Loader_05.jpg",
      title: "CATERPILLAR 950 GC Wheel Loader 05.jpg",
      license: "CC BY-SA 4.0",
      artist: "Oto Zapletal",
    },
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/CATERPILLAR_950_GC_Wheel_Loader_03.jpg/1280px-CATERPILLAR_950_GC_Wheel_Loader_03.jpg",
      title: "CATERPILLAR 950 GC Wheel Loader 03.jpg",
      license: "CC BY-SA 4.0",
      artist: "Oto Zapletal",
    },
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4f/CATERPILLAR_950_GC_Wheel_Loader_04.jpg/1280px-CATERPILLAR_950_GC_Wheel_Loader_04.jpg",
      title: "CATERPILLAR 950 GC Wheel Loader 04.jpg",
      license: "CC BY-SA 4.0",
      artist: "Oto Zapletal",
    },
  ],
  BACKHOE: [
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/40/Caterpillar_backhoe_loader_at_construction_site_in_Sunnyvale%2C_back_view.jpg/1280px-Caterpillar_backhoe_loader_at_construction_site_in_Sunnyvale%2C_back_view.jpg",
      title: "Caterpillar backhoe loader at construction site in Sunnyvale, back view.jpg",
      license: "CC BY-SA 3.0",
      artist: "Grendelkhan",
    },
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/69/Terex_TLB_825_in_Saint_Petersburg.jpg/1280px-Terex_TLB_825_in_Saint_Petersburg.jpg",
      title: "Terex TLB 825 in Saint Petersburg.jpg",
      license: "CC BY-SA 4.0",
      artist: "Dmitry Ivanov.",
    },
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Koparko-ladowarka.jpg/1280px-Koparko-ladowarka.jpg",
      title: "Koparko-ladowarka.jpg",
      license: "CC BY-SA 4.0",
      artist: "Zdzislawdyrman",
    },
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Fiat_Hitachi_W170_-_wheeled_loader_-_backhoe_loader_-_Belgian_Army.png/1280px-Fiat_Hitachi_W170_-_wheeled_loader_-_backhoe_loader_-_Belgian_Army.png",
      title: "Fiat Hitachi W170 - wheeled loader - backhoe loader - Belgian Army.png",
      license: "CC0",
      artist: "Fabien Tremoulinas",
    },
  ],
  DUMP_TRUCK: [
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/90/Articulated_hauler.jpg/1280px-Articulated_hauler.jpg",
      title: "Articulated hauler.jpg",
      license: "CC0",
      artist: "Wikideas1",
    },
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/04/Articulated_dump_truck%2C_Elibank_%5E_Traquair_Forest_-_geograph.org.uk_-_7457571.jpg/1280px-Articulated_dump_truck%2C_Elibank_%5E_Traquair_Forest_-_geograph.org.uk_-_7457571.jpg",
      title: "Articulated dump truck, Elibank ^ Traquair Forest - geograph.org.uk - 7457571.jpg",
      license: "CC BY-SA 2.0",
      artist: "Jim Barton",
    },
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c4/Volvo_-_A306_%28Articulated_Dump_Truck%29_-_geograph.org.uk_-_6831621.jpg/1280px-Volvo_-_A306_%28Articulated_Dump_Truck%29_-_geograph.org.uk_-_6831621.jpg",
      title: "Volvo - A306 (Articulated Dump Truck) - geograph.org.uk - 6831621.jpg",
      license: "CC BY-SA 2.0",
      artist: "Mr Ignavy",
    },
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/30/Tournapull_C_articulated_hauler.JPG/1280px-Tournapull_C_articulated_hauler.JPG",
      title: "Tournapull C articulated hauler.JPG",
      license: "CC BY 4.0",
      artist: "Antti Leppänen",
    },
  ],
  COMPACTOR: [
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/62/Caterpillar_CB54B_roller_on_dirt_lot_in_Campbell.jpg/1280px-Caterpillar_CB54B_roller_on_dirt_lot_in_Campbell.jpg",
      title: "Caterpillar CB54B roller on dirt lot in Campbell.jpg",
      license: "CC BY-SA 4.0",
      artist: "Grendelkhan",
    },
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/cc/Hamm_HD10_roller_%28front%29.jpg/1280px-Hamm_HD10_roller_%28front%29.jpg",
      title: "Hamm HD10 roller (front).jpg",
      license: "CC BY-SA 4.0",
      artist: "Peulle",
    },
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/06/Budowa_Velostrady_nr_6_-_odcinek_Katowice_Bryn%C3%B3w_-_Katowice_Bryn%C3%B3w%2C_wyr%C3%B3wnywarka_oraz_walec_podczas_pracy.jpg/1280px-Budowa_Velostrady_nr_6_-_odcinek_Katowice_Bryn%C3%B3w_-_Katowice_Bryn%C3%B3w%2C_wyr%C3%B3wnywarka_oraz_walec_podczas_pracy.jpg",
      title: "Budowa Velostrady nr 6 - odcinek Katowice Brynów - Katowice Brynów, wyrównywarka oraz walec podczas pracy.jpg",
      license: "CC BY 4.0",
      artist: "Krzysztof Popławski",
    },
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/1/1d/Road_roller_ride-on_articulating-swivel_small_01.jpg",
      title: "Road roller ride-on articulating-swivel small 01.jpg",
      license: "CC BY 2.5",
      artist: "RickP",
    },
  ],
  FORKLIFT: [
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/69/Forklifts_load_crates_onto_trailer_trucks_at_the_warehouse_operated_by_the_1st_Logistical_Command_at_Cam_Ranh_Bay.jpg/1280px-Forklifts_load_crates_onto_trailer_trucks_at_the_warehouse_operated_by_the_1st_Logistical_Command_at_Cam_Ranh_Bay.jpg",
      title: "Forklifts load crates onto trailer trucks at the warehouse operated by the 1st Logistical Command at Cam Ranh Bay.jpg",
      license: "Public domain",
      artist: "SSG Alfred Batungbacal",
    },
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f3/Busy_warehouse_operations.png/1280px-Busy_warehouse_operations.png",
      title: "Busy warehouse operations.png",
      license: "CC BY-SA 4.0",
      artist: "GeorgeHillTimber",
    },
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/Forklift_trucks_moving_timber.png/1280px-Forklift_trucks_moving_timber.png",
      title: "Forklift trucks moving timber.png",
      license: "CC BY-SA 4.0",
      artist: "GeorgeHillTimber",
    },
    {
      url: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/Aerial_view_of_trucks_at_building_yard.png/1280px-Aerial_view_of_trucks_at_building_yard.png",
      title: "Aerial view of trucks at building yard.png",
      license: "CC BY-SA 4.0",
      artist: "GeorgeHillTimber",
    },
  ],
};

/**
 * Stable pick for one machine. Keyed on the code (`EXC-0007`), not on a random
 * draw, so the same machine keeps the same photo across reseeds and two
 * excavators standing next to each other do not show the same picture.
 */
export function photoFor(type: EquipmentType, code: string): EquipmentPhoto | null {
  const options = EQUIPMENT_PHOTOS[type];
  if (!options?.length) return null;
  let hash = 0;
  for (let i = 0; i < code.length; i++) hash = (hash * 31 + code.charCodeAt(i)) >>> 0;
  return options[hash % options.length] ?? null;
}
