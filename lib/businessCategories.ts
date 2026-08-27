/**
 * Concord Deal Platform
 * Copyright (c) 2026 Rabin Timsina (EZ Business Advisors LLC). All rights reserved.
 * Proprietary & confidential. No copying, distribution, or modification without
 * prior written permission. See LICENSE for full terms.
 */

// =============================================================================
// Business Category Taxonomy — the canonical list of business-for-sale
// categories used by the marketplace search + listing studio autocomplete.
// Categories are curated so suggestions are always real business categories
// (never junk free-text pulled from listing data).
// =============================================================================

export const BUSINESS_CATEGORIES: string[] = [
  // Retail & consumer goods
  'Retail',
  'Convenience Store',
  'Liquor Store',
  'Smoke Shop',
  'Vape Shop',
  'Tobacco Shop',
  'Grocery',
  'Supermarket',
  'Indian Grocery',
  'Indian Store',
  'International Grocery',
  'Ethnic Grocery',
  'Dollar Store',
  'E-Commerce',
  'Franchise',
  'Book Store',
  'Gift Shop',
  'Florist',
  'Jewelry',
  'Hardware Store',
  'Furniture Store',
  'Appliance Store',
  'Cell Phone Store',
  'Electronics Store',
  'Sporting Goods',
  'Bicycle Shop',
  'Toy Store',
  'Game Store',
  'Pawn Shop',
  'Thrift Store',
  'Antique Store',
  'Party Supplies',
  'Costume Store',
  'Boutique',
  'Shoe Store',
  'Mattress Store',
  'Optical Store',
  'Health Food Store',
  'Supplement Store',
  'Tea Shop',
  'Hookah Lounge',
  'Cannabis Dispensary',
  'CBD Shop',
  // Food & beverage
  'Restaurant',
  'Food & Beverage',
  'Bakery',
  'Coffee Shop',
  'Catering',
  'Food Truck',
  'Pizza Shop',
  'Fast Food',
  'Quick Service Restaurant',
  'Ice Cream Shop',
  'Donut Shop',
  'Smoothie Bar',
  'Juice Bar',
  'Bar',
  'Pub',
  'Nightclub',
  'Brewery',
  'Distillery',
  'Winery',
  'Deli',
  'Butcher Shop',
  'Seafood Market',
  'Produce Market',
  'Ghost Kitchen',
  'Meal Prep',
  'Candy Shop',
  'Chocolate Shop',
  // Trades & construction
  'Trades & Construction',
  'Plumbing',
  'HVAC',
  'Electrical',
  'Landscaping',
  'Roofing',
  'General Contracting',
  'Painting',
  'Remodeling',
  'Kitchen & Bath',
  'Masonry',
  'Fencing',
  'Flooring',
  'Drywall',
  'Insulation',
  'Siding',
  'Window Cleaning',
  'Carpet Cleaning',
  'Pressure Washing',
  'Handyman',
  'Tree Service',
  'Snow Removal',
  'Lawn Care',
  'Arborist',
  'Pool Service',
  'Pest Control',
  // Automotive
  'Automotive',
  'Auto Repair',
  'Auto Detailing',
  'Auto Services',
  'Auto Body',
  'Auto Glass',
  'Car Wash',
  'Gas Station',
  'Trucking',
  'Tire Shop',
  'Oil Change',
  'Motorcycle Shop',
  'Boat Dealer',
  'RV Dealer',
  'Marina',
  'Towing',
  'Moving',
  'Courier',
  'Freight Broker',
  // Healthcare
  'Healthcare',
  'Dental',
  'Pharmacy',
  'Home Care',
  'Veterinary',
  'Medical',
  'Physical Therapy',
  'Urgent Care',
  'Clinic',
  'Chiropractic',
  'Optometry',
  'Audiology',
  'Massage Therapy',
  'Med Spa',
  'Dermatology',
  'Dental Lab',
  'Hospice',
  'Senior Care',
  'Assisted Living',
  'Medical Billing',
  // Business services
  'Business Services',
  'Cleaning',
  'Janitorial',
  'Accounting',
  'Marketing',
  'IT Services',
  'Consulting',
  'Staffing',
  'Security',
  'Printing',
  'Locksmith',
  'Alarm Company',
  'Fire Protection',
  'Insurance Agency',
  'Mortgage Broker',
  'Tax Preparation',
  'Payroll',
  'Recruiting',
  'Public Relations',
  'Web Design',
  'SEO',
  'Social Media Agency',
  'Digital Marketing',
  'Photography',
  'Videography',
  'Event Planning',
  'DJ Service',
  // Technology
  'Technology',
  'Software',
  'SaaS',
  'App Development',
  'Data Analytics',
  'Cybersecurity',
  'Managed Services',
  'Computer Repair',
  'Phone Repair',
  // Industrial
  'Manufacturing',
  'Warehouse',
  'Storage',
  'Self Storage',
  'Mini Storage',
  'Logistics',
  'Distribution',
  'Metal Fabrication',
  'Machine Shop',
  'CNC Machining',
  'Welding',
  'Plastics',
  'Injection Molding',
  'Packaging',
  'Screen Printing',
  'Sign Shop',
  'Textile',
  'Garment Manufacturing',
  // Hospitality
  'Hotel',
  'Motel',
  'Hospitality',
  'Bed & Breakfast',
  'Vacation Rental',
  'Campground',
  // Personal services
  'Salon',
  'Barbershop',
  'Nail Salon',
  'Spa',
  'Gym',
  'Fitness',
  'Yoga Studio',
  'Pilates Studio',
  'CrossFit',
  'Martial Arts',
  'Dance Studio',
  'Tattoo Studio',
  'Piercing Studio',
  'Tanning Salon',
  'Daycare',
  'Pet Grooming',
  'Pet Store',
  'Laundromat',
  'Dry Cleaner',
  'Tailor',
  'Vending',
  'Funeral Home',
  'Real Estate',
  'Education',
  'Tutoring',
  'Test Prep',
  'Driving School',
  'Music School',
  'Art School',
  'Language School',
  'Preschool',
  'After School Program',
  'Entertainment',
  'Arcade',
  'Bowling Alley',
  'Golf Course',
  'Escape Room',
  'Trampoline Park',
  'Karaoke',
  'Agriculture',
  'Farm',
  'Ranch',
  'Greenhouse',
  'Nursery',
  'Garden Center',
  'Feed Store',
  'Livestock',
]

/** Title-case a free-text value so "home Care agency" → "Home Care Agency". */
export function titleCaseCategory(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((w) => (w.length > 1 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toUpperCase()))
    .join(' ')
}

/**
 * Build the category suggestion list for a query: curated taxonomy first
 * (prefix matches ranked ahead of contains matches), then clean listing-derived
 * values appended as extras (title-cased, trimmed, deduped).
 */
export function suggestBusinessCategories(query: string, listingValues: string[] = []): string[] {
  const q = query.trim().toLowerCase()
  const seen = new Set<string>()
  const out: string[] = []

  const push = (v: string) => {
    const key = v.toLowerCase()
    if (v && !seen.has(key)) {
      seen.add(key)
      out.push(v)
    }
  }

  // Curated taxonomy — prefix matches first, then contains matches.
  if (q) {
    for (const c of BUSINESS_CATEGORIES) if (c.toLowerCase().startsWith(q)) push(c)
    for (const c of BUSINESS_CATEGORIES) if (!seen.has(c.toLowerCase()) && c.toLowerCase().includes(q)) push(c)
  } else {
    for (const c of BUSINESS_CATEGORIES) push(c)
  }

  // Listing-derived extras (cleaned), so brokers can still find custom sub-industries.
  for (const raw of listingValues) {
    const clean = titleCaseCategory(raw)
    if (!clean) continue
    if (q && !clean.toLowerCase().includes(q)) continue
    push(clean)
  }

  return out
}
