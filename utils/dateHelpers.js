//return current academic year
function getAcademicYear() {

  // get current date and extract year/month
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    //start academid year - before august is last year, after is this year
    const startYear = month < 8 ? year - 1 : year;

    // end academic year 1 year after starting
    const endYear = startYear + 1;
    return `${startYear}-${endYear}`;
  }
  
  module.exports = { getAcademicYear };
  