function getAcademicYear() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const startYear = month < 8 ? year - 1 : year;
    const endYear = startYear + 1;
    return `${startYear}-${endYear}`;
  }
  
  module.exports = { getAcademicYear };
  