import {
  FiAward,
  FiBriefcase,
  FiCoffee,
  FiFilm,
  FiFileText,
  FiGift,
  FiHeart,
  FiHome,
  FiMap,
  FiPenTool,
  FiPlusCircle,
  FiRefreshCw,
  FiRotateCcw,
  FiShoppingBag,
  FiShoppingCart,
  FiTag,
  FiTrendingUp,
  FiTruck,
} from "react-icons/fi";

const CATEGORY_ICONS = {
  supermercato: FiShoppingCart,
  spesa: FiShoppingCart,
  alimentazione: FiCoffee,
  trasporti: FiTruck,
  casa: FiHome,
  abbonamenti: FiRefreshCw,
  shopping: FiShoppingBag,
  salute: FiHeart,
  intrattenimento: FiFilm,
  viaggi: FiMap,
  tasse: FiFileText,
  stipendio: FiBriefcase,
  freelance: FiPenTool,
  bonus: FiAward,
  vendite: FiTag,
  rimborso: FiRotateCcw,
  investimenti: FiTrendingUp,
  regalo: FiGift,
};

/** Icon component for a category; income "altro" gets a plus so it reads as money in. */
export const getCategoryIcon = (category, type) => {
  if (CATEGORY_ICONS[category]) return CATEGORY_ICONS[category];
  return type === "income" ? FiPlusCircle : FiTag;
};
